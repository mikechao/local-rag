import { sql, eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import { embedQuery } from "./embedding-worker";
import { chunkEmbeddings, documentChunks, documents } from "../db/schema";
import { getEmbeddingModelId } from "./models/model-registry";
import { rerank } from "./models/rerankerModel";

export type RetrievalResult = {
  chunkIds: string[];
  docId: string;
  docType: string;
  filename: string;
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

type DbChunkResult = {
  id: string;
  docId: string;
  docType: string;
  filename: string;
  pageNumber: number;
  chunkIndex: number;
  headingPath: string | null;
  text: string;
  similarity: number;
  trigramScore?: number;
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
    const embeddingModelId = getEmbeddingModelId();

    // Extract keywords for trigram search
    const keywords = extractKeywords(query);

    // 1. Start Embedding (Worker) - CPU heavy
    performance.mark("retrieval:embed-query-start");
    const embeddingPromise = embedQuery(query);

    // 2. Start Trigram Search (DB) - I/O heavy (or memory scan)
    // We launch this concurrently with the embedding generation
    performance.mark("retrieval:trigram-search-start");
    let trigramPromise: Promise<DbChunkResult[]> = Promise.resolve([]);

    if (keywords.length > 0) {
      // Join keywords into a search string for trigram matching
      const searchString = keywords.join(" ");

      // Use pg_trgm word_similarity - better for finding words within longer text
      const trigramSimilarity = sql<number>`word_similarity(${searchString}, ${documentChunks.text})`;

      // Fetch candidates (2x limit)
      trigramPromise = db
        .select({
          id: documentChunks.id,
          docId: documentChunks.docId,
          docType: documentChunks.docType,
          filename: documents.filename,
          pageNumber: documentChunks.pageNumber,
          chunkIndex: documentChunks.chunkIndex,
          headingPath: documentChunks.headingPath,
          text: documentChunks.text,
          similarity: sql<number>`0`, // Placeholder
          trigramScore: trigramSimilarity,
        })
        .from(documentChunks)
        .innerJoin(documents, eq(documentChunks.docId, documents.id))
        .where(
          and(
            eq(documentChunks.embedded, true),
            // Use the <% operator for word similarity (word in longer text)
            sql`${searchString} <% ${documentChunks.text}`,
            docId ? eq(documentChunks.docId, docId) : undefined,
            docType ? eq(documentChunks.docType, docType) : undefined,
          ),
        )
        .orderBy(desc(trigramSimilarity))
        .limit(limit * 2) as Promise<DbChunkResult[]>;
    }

    // 3. Vector Search logic (needs embedding first)
    const vectorSearchPromise = (async () => {
      const queryEmbedding = await embeddingPromise;
      const vectorStr = JSON.stringify(queryEmbedding);
      performance.mark("retrieval:embed-query-end");
      performance.measure(
        "retrieval:embed-query",
        "retrieval:embed-query-start",
        "retrieval:embed-query-end",
      );

      performance.mark("retrieval:vector-search-start");
      // Use explicit distance operator for ordering to ensure HNSW index usage
      const vectorDistance = sql<number>`${chunkEmbeddings.embedding} <=> ${vectorStr}`;
      const vectorSimilarity = sql<number>`1 - (${vectorDistance})`;

      // Fetch candidates (2x limit)
      const results = (await db
        .select({
          id: documentChunks.id,
          docId: documentChunks.docId,
          docType: documentChunks.docType,
          filename: documents.filename,
          pageNumber: documentChunks.pageNumber,
          chunkIndex: documentChunks.chunkIndex,
          headingPath: documentChunks.headingPath,
          text: documentChunks.text,
          similarity: vectorSimilarity,
        })
        .from(chunkEmbeddings)
        .innerJoin(
          documentChunks,
          eq(documentChunks.id, chunkEmbeddings.chunkId),
        )
        .innerJoin(documents, eq(documentChunks.docId, documents.id))
        .where(
          and(
            eq(chunkEmbeddings.embeddingModel, embeddingModelId),
            docId ? eq(documentChunks.docId, docId) : undefined,
            docType ? eq(documentChunks.docType, docType) : undefined,
          ),
        )
        .orderBy(vectorDistance) // ASC distance guarantees index usage
        .limit(limit * 2)) as DbChunkResult[];

      performance.mark("retrieval:vector-search-end");
      performance.measure(
        "retrieval:vector-search",
        "retrieval:vector-search-start",
        "retrieval:vector-search-end",
      );
      return results;
    })();

    // 4. Await both searches in parallel
    const [vectorResults, trigramResults] = await Promise.all([
      vectorSearchPromise,
      trigramPromise,
    ]);

    performance.mark("retrieval:trigram-search-end");
    performance.measure(
      "retrieval:trigram-search",
      "retrieval:trigram-search-start",
      "retrieval:trigram-search-end",
    );

    // 5. Merge and Interleave Candidates
    performance.mark("retrieval:merge-candidates-start");

    // Interleave results to ensure we have a mix for the reranker
    const MAX_RERANK_CANDIDATES = 20; // Reduced further for performance
    const candidateMap = new Map<string, DbChunkResult>();

    for (let i = 0; i < limit * 2; i++) {
      if (vectorResults[i])
        candidateMap.set(vectorResults[i].id, vectorResults[i]);
      if (candidateMap.size >= MAX_RERANK_CANDIDATES) break;

      if (trigramResults[i])
        candidateMap.set(trigramResults[i].id, trigramResults[i]);
      if (candidateMap.size >= MAX_RERANK_CANDIDATES) break;
    }

    let combinedResults = Array.from(candidateMap.values());

    performance.mark("retrieval:merge-candidates-end");
    performance.measure(
      "retrieval:merge-candidates",
      "retrieval:merge-candidates-start",
      "retrieval:merge-candidates-end",
    );

    // 6. Rerank Candidates
    performance.mark("retrieval:rerank-start");

    // Extract texts for reranking
    const documentsToRank = combinedResults.map((r) => r.text);
    // Call the reranker model
    const reranked = await rerank(query, documentsToRank, {
      top_k: limit * 2,
      return_documents: false,
    });

    // Map scores back to results
    const scoredResults = reranked.map((r) => {
      const original = combinedResults[r.corpus_id];
      return {
        ...original,
        similarity: r.score,
        rerankScore: r.score,
      };
    });

    combinedResults = scoredResults;

    performance.mark("retrieval:rerank-end");
    performance.measure(
      "retrieval:rerank",
      "retrieval:rerank-start",
      "retrieval:rerank-end",
    );

    // 7. Filter by threshold
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

    // 8. Merge consecutive chunks from the same document page
    performance.mark("retrieval:merge-start");
    const allMerged: RetrievalResult[] = [];

    for (const [_, docChunks] of groupedByDoc) {
      docChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      let currentGroup: typeof docChunks = [];

      for (const chunk of docChunks) {
        if (currentGroup.length === 0) {
          currentGroup.push(chunk);
        } else {
          const last = currentGroup[currentGroup.length - 1];
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

    allMerged.sort((a, b) => b.similarity - a.similarity);
    const finalResults = allMerged.slice(0, limit);

    performance.mark("retrieval:merge-end");
    performance.measure(
      "retrieval:merge",
      "retrieval:merge-start",
      "retrieval:merge-end",
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

    return { results: finalResults };
  } catch (error) {
    console.error("Retrieval error:", error);
    return { results: [], reason: "error" };
  }
}

function mergeGroup(chunks: DbChunkResult[]): RetrievalResult {
  const first = chunks[0];
  const headingPath = chunks.find((c) => c.headingPath)?.headingPath || null;

  return {
    chunkIds: chunks.map((c) => c.id),
    docId: first.docId,
    docType: first.docType,
    filename: first.filename,
    pageNumber: first.pageNumber,
    headingPath,
    text: chunks.map((c) => c.text).join("\n"),
    similarity: Math.max(...chunks.map((c) => c.similarity)),
  };
}
