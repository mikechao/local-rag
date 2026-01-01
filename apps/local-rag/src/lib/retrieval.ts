import { sql, eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import { embedQuery } from "./embedding-worker";
import { chunkEmbeddings, documentChunks } from "../db/schema";
import { getEmbeddingModelId } from "./models/model-registry";

export type RetrievalResult = {
  chunkIds: string[];
  docId: string;
  docType: string;
  pageNumber: number;
  headingPath?: string | null;
  text: string;
  similarity: number;
  rerankScore?: number;
};

export type RetrievalOptions = {
  limit?: number;
  docId?: string;
  docType?: string;
  similarityThreshold?: number;
  logPerf?: boolean;
};

export type RetrievalResponse = {
  results: RetrievalResult[];
  reason?: "model_mismatch" | "error";
};

// Common English stop words to filter out from keyword extraction
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "and",
  "but",
  "or",
  "nor",
  "so",
  "yet",
  "both",
  "either",
  "neither",
  "not",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "just",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "how",
  "why",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
]);

/**
 * Extract meaningful keywords from a query string.
 * Filters out stop words and returns lowercase keywords.
 */
function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export async function retrieveChunks(
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievalResponse> {
  try {
    const { limit = 10, docId, docType, similarityThreshold = 0.3 } = options;
    const db = await getDb();

    // Extract keywords for trigram search
    const keywords = extractKeywords(query);

    // 1. Embed query for vector search
    performance.mark("retrieval:embed-query-start");
    const queryEmbedding = await embedQuery(query);
    const vectorStr = JSON.stringify(queryEmbedding);
    performance.mark("retrieval:embed-query-end");
    performance.measure(
      "retrieval:embed-query",
      "retrieval:embed-query-start",
      "retrieval:embed-query-end",
    );

    // 2. Vector similarity search (semantic)
    performance.mark("retrieval:vector-search-start");
    const vectorSimilarity = sql<number>`1 - (${chunkEmbeddings.embedding} <=> ${vectorStr})`;

    const embeddingModelId = getEmbeddingModelId();
    const vectorResults = await db
      .select({
        id: documentChunks.id,
        docId: documentChunks.docId,
        docType: documentChunks.docType,
        pageNumber: documentChunks.pageNumber,
        chunkIndex: documentChunks.chunkIndex,
        headingPath: documentChunks.headingPath,
        text: documentChunks.text,
        similarity: vectorSimilarity,
      })
      .from(chunkEmbeddings)
      .innerJoin(documentChunks, eq(documentChunks.id, chunkEmbeddings.chunkId))
      .where(
        and(
          eq(chunkEmbeddings.embeddingModel, embeddingModelId),
          docId ? eq(documentChunks.docId, docId) : undefined,
          docType ? eq(documentChunks.docType, docType) : undefined,
        ),
      )
      .orderBy(desc(vectorSimilarity))
      .limit(limit);
    performance.mark("retrieval:vector-search-end");
    performance.measure(
      "retrieval:vector-search",
      "retrieval:vector-search-start",
      "retrieval:vector-search-end",
    );

    // 3. Trigram search using pg_trgm (if we have keywords)
    // This finds chunks that are textually similar to the query keywords
    performance.mark("retrieval:trigram-search-start");
    let trigramResults: typeof vectorResults = [];
    if (keywords.length > 0) {
      // Join keywords into a search string for trigram matching
      const searchString = keywords.join(" ");

      // Use pg_trgm word_similarity - better for finding words within longer text
      const trigramSimilarity = sql<number>`word_similarity(${searchString}, ${documentChunks.text})`;

      trigramResults = await db
        .select({
          id: documentChunks.id,
          docId: documentChunks.docId,
          docType: documentChunks.docType,
          pageNumber: documentChunks.pageNumber,
          chunkIndex: documentChunks.chunkIndex,
          headingPath: documentChunks.headingPath,
          text: documentChunks.text,
          similarity: vectorSimilarity,
          trigramScore: trigramSimilarity,
        })
        .from(chunkEmbeddings)
        .innerJoin(
          documentChunks,
          eq(documentChunks.id, chunkEmbeddings.chunkId),
        )
        .where(
          and(
            eq(chunkEmbeddings.embeddingModel, embeddingModelId),
            // Use the <% operator for word similarity (word in longer text)
            sql`${searchString} <% ${documentChunks.text}`,
            docId ? eq(documentChunks.docId, docId) : undefined,
            docType ? eq(documentChunks.docType, docType) : undefined,
          ),
        )
        .orderBy(desc(trigramSimilarity))
        .limit(limit);
    }
    performance.mark("retrieval:trigram-search-end");
    performance.measure(
      "retrieval:trigram-search",
      "retrieval:trigram-search-start",
      "retrieval:trigram-search-end",
    );
    // 4. Merge and re-rank results using Reciprocal Rank Fusion (RRF)
    // RRF is a proven method for combining rankings from multiple sources
    performance.mark("retrieval:rrf-start");
    const RRF_K = 60; // Standard RRF constant
    const resultMap = new Map<
      string,
      {
        result: (typeof vectorResults)[0];
        vectorRank: number | null;
        trigramRank: number | null;
        trigramScore: number;
      }
    >();

    // Add vector results with their rank
    vectorResults.forEach((r, index) => {
      resultMap.set(r.id, {
        result: r,
        vectorRank: index + 1,
        trigramRank: null,
        trigramScore: 0,
      });
    });

    // Add trigram results with their rank
    trigramResults.forEach((r, index) => {
      const trigramScore =
        (r as typeof r & { trigramScore: number }).trigramScore || 0;
      if (resultMap.has(r.id)) {
        const existing = resultMap.get(r.id)!;
        existing.trigramRank = index + 1;
        existing.trigramScore = trigramScore;
      } else {
        resultMap.set(r.id, {
          result: r,
          vectorRank: null,
          trigramRank: index + 1,
          trigramScore: trigramScore,
        });
      }
    });

    // Calculate RRF score for each result
    const combinedResults = Array.from(resultMap.values())
      .map((item) => {
        // RRF formula: score = sum(1 / (k + rank)) for each ranking
        let rrfScore = 0;
        if (item.vectorRank !== null) {
          rrfScore += 1 / (RRF_K + item.vectorRank);
        }
        if (item.trigramRank !== null) {
          // Give trigram results extra weight since they indicate keyword matches
          rrfScore += 1.5 / (RRF_K + item.trigramRank);
        }

        return {
          ...item.result,
          hybridScore: rrfScore,
          // For display, normalize to 0-1 range (approximate)
          similarity: Math.min(1.0, rrfScore * 50),
        };
      })
      .sort((a, b) => b.hybridScore - a.hybridScore);
    performance.mark("retrieval:rrf-end");
    performance.measure(
      "retrieval:rrf",
      "retrieval:rrf-start",
      "retrieval:rrf-end",
    );

    // 5. Filter by threshold
    performance.mark("retrieval:filter-start");
    const filtered = combinedResults.filter(
      (r) => r.similarity >= similarityThreshold,
    );
    performance.mark("retrieval:filter-end");
    performance.measure(
      "retrieval:filter",
      "retrieval:filter-start",
      "retrieval:filter-end",
    );

    // Group by docId to facilitate merging
    performance.mark("retrieval:group-start");
    const groupedByDoc = new Map<string, typeof filtered>();
    for (const r of filtered) {
      if (!groupedByDoc.has(r.docId)) {
        groupedByDoc.set(r.docId, []);
      }
      groupedByDoc.get(r.docId)!.push(r);
    }
    performance.mark("retrieval:group-end");
    performance.measure(
      "retrieval:group",
      "retrieval:group-start",
      "retrieval:group-end",
    );

    // 6. Merge consecutive chunks from the same document page
    performance.mark("retrieval:merge-start");
    const allMerged: RetrievalResult[] = [];

    for (const [_, docChunks] of groupedByDoc) {
      // Sort by chunkIndex to find consecutive chunks
      docChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      let currentGroup: typeof docChunks = [];

      for (const chunk of docChunks) {
        if (currentGroup.length === 0) {
          currentGroup.push(chunk);
        } else {
          const last = currentGroup[currentGroup.length - 1];
          // Merge if consecutive chunk index and same page
          if (
            chunk.chunkIndex === last.chunkIndex + 1 &&
            chunk.pageNumber === last.pageNumber
          ) {
            currentGroup.push(chunk);
          } else {
            allMerged.push(mergeGroup(currentGroup));
            currentGroup = [chunk];
          }
        }
      }
      if (currentGroup.length > 0) {
        allMerged.push(mergeGroup(currentGroup));
      }
    }

    // Sort by similarity descending
    allMerged.sort((a, b) => b.similarity - a.similarity);
    performance.mark("retrieval:merge-end");
    performance.measure(
      "retrieval:merge",
      "retrieval:merge-start",
      "retrieval:merge-end",
    );
    // Deduplicate by text content
    performance.mark("retrieval:deduplicate-start");
    const uniqueResults: RetrievalResult[] = [];
    const seenText = new Set<string>();

    for (const r of allMerged) {
      if (!seenText.has(r.text)) {
        seenText.add(r.text);
        uniqueResults.push(r);
      }
    }
    performance.mark("retrieval:deduplicate-end");
    performance.measure(
      "retrieval:deduplicate",
      "retrieval:deduplicate-start",
      "retrieval:deduplicate-end",
    );

    if (options?.logPerf) {
      const entries = performance
        .getEntriesByType("measure")
        .filter((e) => e.name.startsWith("retrieval:"));
      for (const e of entries) {
        console.log(`${e.name} took ${e.duration.toFixed(2)} ms`);
        performance.clearMarks(e.name);
        performance.clearMeasures(e.name);
      }
    }

    return { results: uniqueResults };
  } catch (error) {
    console.error("Retrieval error:", error);
    return { results: [], reason: "error" };
  }
}

function mergeGroup(
  chunks: {
    id: string;
    docId: string;
    docType: string;
    pageNumber: number;
    chunkIndex: number;
    headingPath: string | null;
    text: string;
    similarity: number;
  }[],
): RetrievalResult {
  const first = chunks[0];
  // Find first non-empty heading path
  const headingPath = chunks.find((c) => c.headingPath)?.headingPath || null;

  return {
    chunkIds: chunks.map((c) => c.id),
    docId: first.docId,
    docType: first.docType,
    pageNumber: first.pageNumber,
    headingPath,
    text: chunks.map((c) => c.text).join("\n"),
    similarity: Math.max(...chunks.map((c) => c.similarity)),
  };
}
