import { sql, eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import { embedQuery } from "./embedding-worker";
import { chunkEmbeddings, documentChunks } from "../db/schema";
import { MODEL_ID } from "./models/embeddingModel";

export type RetrievalResult = {
	chunkIds: string[];
	docId: string;
	docType: string;
	pageNumber: number;
	headingPath?: string | null;
	text: string;
	similarity: number;
};

export type RetrievalOptions = {
	limit?: number;
	docId?: string;
	docType?: string;
	similarityThreshold?: number;
};

export type RetrievalResponse = {
	results: RetrievalResult[];
	reason?: "model_mismatch" | "error";
};

export async function retrieveChunks(
	query: string,
	options: RetrievalOptions = {},
): Promise<RetrievalResponse> {
	try {
		const { limit = 8, docId, docType, similarityThreshold = 0.25 } = options;
		const db = await getDb();

		// 1. Embed query
		const queryEmbedding = await embedQuery(query);
		const vectorStr = JSON.stringify(queryEmbedding);

		// 2. Candidate search
		// We use raw SQL for the distance calculation to ensure correct operator usage
		const similarity = sql<number>`1 - (${chunkEmbeddings.embedding} <=> ${vectorStr})`;

		const results = await db
			.select({
				id: documentChunks.id,
				docId: documentChunks.docId,
				docType: documentChunks.docType,
				pageNumber: documentChunks.pageNumber,
				chunkIndex: documentChunks.chunkIndex,
				headingPath: documentChunks.headingPath,
				text: documentChunks.text,
				similarity: similarity,
			})
			.from(chunkEmbeddings)
			.innerJoin(documentChunks, eq(documentChunks.id, chunkEmbeddings.chunkId))
			.where(
				and(
					eq(chunkEmbeddings.embeddingModel, MODEL_ID),
					docId ? eq(documentChunks.docId, docId) : undefined,
					docType ? eq(documentChunks.docType, docType) : undefined,
				),
			)
			.orderBy(desc(similarity))
			.limit(limit);

		// 3. Post-processing
		// Filter by threshold
		const filtered = results.filter((r) => r.similarity >= similarityThreshold);

		// Group by docId to facilitate merging
		const groupedByDoc = new Map<string, typeof filtered>();
		for (const r of filtered) {
			if (!groupedByDoc.has(r.docId)) {
				groupedByDoc.set(r.docId, []);
			}
			groupedByDoc.get(r.docId)!.push(r);
		}

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

		// Deduplicate by text content
		const uniqueResults: RetrievalResult[] = [];
		const seenText = new Set<string>();

		for (const r of allMerged) {
			if (!seenText.has(r.text)) {
				seenText.add(r.text);
				uniqueResults.push(r);
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
