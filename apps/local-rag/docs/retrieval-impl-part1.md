# Retrieval Implementation (Part 1: Baseline Vector)

This document details the implementation of the "Baseline Vector" retrieval pipeline as outlined in `retrieval-plan.md`.

## 1. Database Indexes (Migration)

We added a custom migration to create HNSW and IVFFlat indexes on the `chunk_embeddings` table to support efficient vector similarity search.

**File:** `apps/local-rag/drizzle/0003_add_vector_indexes.sql`

```sql
-- Primary: HNSW
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_hnsw
ON chunk_embeddings USING hnsw (embedding vector_l2_ops)
WITH (m = 16, ef_construction = 64);

-- Optional fallback: IVFFlat
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_ivfflat
ON chunk_embeddings USING ivfflat (embedding vector_l2_ops)
WITH (lists = 100);

-- Filter helper
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_model
ON chunk_embeddings (embedding_model);
```

## 2. Embedding Worker Helper

We extended the embedding worker client to support embedding a single query string. This reuses the existing worker infrastructure to avoid loading a second model instance.

**File:** `apps/local-rag/src/lib/embedding-worker.ts`

```typescript
export async function embedQuery(text: string): Promise<number[]> {
	const batchId = crypto.randomUUID();
	// Use a dummy docId for query
	const result = await embedBatchWorker("query", [text], batchId);
	const floatArray = new Float32Array(result.buffer);
	return Array.from(floatArray);
}
```

## 3. Retrieval Logic

The core retrieval logic is implemented in `src/lib/retrieval.ts`. It handles:
1.  **Embedding the query**: Uses `embedQuery`.
2.  **Candidate Search**: Executes a raw SQL query via Drizzle to calculate cosine distance (`<=>`) and filter by metadata.
3.  **Post-processing**:
    *   Filters by similarity threshold (default 0.25).
    *   Merges adjacent chunks from the same document/page.
    *   Deduplicates results based on text content.

**File:** `apps/local-rag/src/lib/retrieval.ts`

```typescript
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

export type RetrievalResponse = {
	results: RetrievalResult[];
	reason?: "model_mismatch" | "error";
};

export type RetrievalOptions = {
	limit?: number;
	docId?: string;
	docType?: string;
	similarityThreshold?: number;
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

		// 3. Post-processing (Filter, Merge, Dedupe)
        // ... (See source file for full merge logic)

		return { results: uniqueResults };
	} catch (error) {
		console.error("Retrieval error:", error);
		return { results: [], reason: "error" };
	}
}
```

## Next Steps

- Integrate `retrieveChunks` into the chat interface (`ChatInterface.tsx` or a new hook).
- Add UI controls for filtering by document.
- Tune `similarityThreshold` based on real-world usage.
