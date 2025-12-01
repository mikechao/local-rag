# Retrieval Plan

Plan for implementing retrieval over locally stored chunk embeddings to power chat-grounding for Local RAG. Focus is on in-browser Postgres (PGlite + pgvector) with offline-first constraints.

## Goals
- Return the most relevant chunks for a user query in <250 ms hot-path latency (embed + search + merge) for typical corpora (<20k chunks) on mid-tier laptops.
- Keep everything local (no network dependency) and reuse the existing embedding model (`MODEL_ID` 768-dim).
- Provide clean interfaces so chat transports and future server modes can share the same retrieval core.
- Allow opt-in filters (by document, type) and be resilient to empty/low-signal queries.

## Constraints & Inputs
- DB: PGlite with `vector` and `lo` extensions already enabled; schema in `src/db/schema.ts`.
  - `document_chunks` → chunk metadata + text.
  - `chunk_embeddings` → vector(768) keyed by `chunk_id`, `embedding_model`.
- Embedding model: same worker-backed model used for document embedding; must avoid loading a second copy in the main thread.
- Local-first: no remote rerankers; any reranking must run in-browser.

## Retrieval Pipeline (V1: “Baseline Vector”)
1. **Embed query**: Use the embedding worker (same model as documents) with a lightweight helper `embedQuery(text, { signal })`.
2. **Candidate search**: Single SQL over pgvector:
   ```sql
   select
     dc.id,
     dc.doc_id,
     dc.doc_type,
     dc.page_number,
     dc.chunk_index,
     dc.heading_path,
     dc.text,
     1 - (chunk_embeddings.embedding <=> :queryEmbedding) as similarity
   from chunk_embeddings
   join document_chunks dc on dc.id = chunk_embeddings.chunk_id
   where chunk_embeddings.embedding_model = :MODEL_ID
     and (:docId is null or dc.doc_id = :docId)
     and (:docType is null or dc.doc_type = :docType)
   order by chunk_embeddings.embedding <=> :queryEmbedding
   limit :k;
   ```
   - Metric: cosine distance (`<=>`) then transform to similarity score.
   - Default `k = 8`; expose override in API.
3. **Post-processing**:
   - Drop results with similarity below a floor (start at `0.25`, tune later).
   - Merge adjacent chunks from the same doc/page when `chunk_index` is consecutive (join text with newline) to reduce fragmentation.
   - When merging, carry `chunkIds: string[]`, aggregate `headingPaths: string[]` (or first non-empty), and keep the min pageNumber / min chunkIndex for ordering.
   - Deduplicate by identical text hash to avoid repeats.
4. **Return shape** (merged span): `{ chunkIds: string[]; docId; docType; pageNumber; headingPath?; text; similarity }[]`. If no merge occurred, `chunkIds` is a single-element array.
5. **Status signaling**: return `{ results, reason?: 'model_mismatch' | 'error' }` so callers can differentiate “no hits” from “embeddings unavailable/outdated.” Default `reason` is undefined when results are valid/empty due to recall.

## Indexing Strategy
- Default to **HNSW** (pgvector 0.8.0 supports it) for best recall/latency; keep **IVFFlat** as a fallback.
- Migration sketch (Drizzle / PGlite):
  ```ts
  // inside a migration file
  import { sql } from "drizzle-orm";

  export const up = async (db) => {
    // Primary: HNSW
    await db.execute(sql`
      create index if not exists idx_chunk_embeddings_hnsw
      on chunk_embeddings using hnsw (embedding vector_l2_ops)
      with (m = 16, ef_construction = 64);
    `);

    // Optional fallback: IVFFlat
    await db.execute(sql`
      create index if not exists idx_chunk_embeddings_ivfflat
      on chunk_embeddings using ivfflat (embedding vector_l2_ops)
      with (lists = 100);
    `);

    // Filter helper
    await db.execute(sql`
      create index if not exists idx_chunk_embeddings_model
      on chunk_embeddings (embedding_model);
    `);
  };

  export const down = async (db) => {
    await db.execute(sql`drop index if exists idx_chunk_embeddings_hnsw;`);
    await db.execute(sql`drop index if exists idx_chunk_embeddings_ivfflat;`);
    // usually keep the model index; drop only if desired
  };
  ```
- Runtime tuning knobs:
  - `set hnsw.ef_search = 40-96` (higher → better recall, slower).
  - `set ivfflat.probes = 1-10` (higher → better recall, slower).
- Maintenance:
  - After creating or bulk-loading embeddings, run `ANALYZE chunk_embeddings;` to refresh planner stats so HNSW/IVFFlat are chosen correctly.
  - Rebuild index after large ingests (>5k new chunks) or model change.
  - Once HNSW is stable, you can drop IVFFlat to save space: `drop index if exists idx_chunk_embeddings_ivfflat;`.
  - If HNSW/IVFFlat index creation fails during migration, log the error so it can be fixed; do not fall back to a sequential scan in this plan.

### Migrations (Drizzle + PGlite)
- Where: `apps/local-rag/drizzle/*.sql` (managed by Drizzle kit; `_journal.json` is maintained by Drizzle—do not edit it manually).
- How to add (explicit):
  1) Run `pnpm db:generate` (Drizzle kit) to produce the next migration stub.
  2) Open the new `apps/local-rag/drizzle/00xx_*.sql` file and append the HNSW / IVFFlat `create index ... using hnsw/ivfflat` statements (see sketch above).
  3) Do **not** touch `_journal.json`; Drizzle kit already recorded the new migration.
- When it runs: `ensureDbReady` → `applyMigrations` (in `src/lib/db.ts`) executes all pending migrations at app start, so these index creations apply automatically.
- Interaction with generated migrations: keep schema changes via `drizzle-kit generate`; keep the vector index DDL manual inside the generated stub (or a later one) so Drizzle doesn’t try to diff them.
- Down migration: drop the HNSW/IVFFlat indexes; keep the btree model index unless you intentionally want it removed.

## API Surface
- New module `src/lib/retrieval.ts` exporting:
  - `retrieveChunks(query: string, opts?: { k?: number; docId?: string; docType?: string; signal?: AbortSignal })`.
  - Internal helpers: `embedQuery`, `searchChunks`, `mergeAdjacent`.
- Provide a thin `getRelevantContext(query, opts)` that returns a concatenated context string ready for prompting (for chat transport integration).
- Filter semantics: `docType` is `"markdown"` or `"pdf"` (matches `document_chunks.doc_type`); leave `docId`/`docType` undefined to search all docs; when both are provided, they are ANDed.

## Chat Integration
- Add a tool/action akin to `getInformation` that calls `retrieveChunks`.
- In the client-side chat transport, before sending to the model, append a system or user message containing the retrieved context (guarded by a toggle so pure LLM chat still works).
- Streaming: retrieval runs before the model stream; expose loading UI state.

## Evaluation Plan
- Manual spot-check set: craft 10–15 Q/A pairs across multiple docs; store expected doc IDs/chunks.
- Metrics to log: latency (embed + query), top-1 correctness, top-3 recall, average similarity of returned results.
- Add a tiny dev-only `pnpm retrieval:test` script that runs the queries against a seeded fixture DB.

## Phase 2 Ideas (after baseline lands)
- **Hybrid search**: combine BM25 (if pg_trgm/tsvector feasible in PGlite) with vector similarity via rank fusion.
- **Local reranker**: small cross-encoder (e.g., MiniLM) served from a worker; only rerank top 20 vector hits.
- **Metadata filters**: by upload date range, filename pattern, or user-assigned tags (requires tags schema).
- **Context packing**: budget-aware packing to stay under model token limits; prefer longer contiguous spans.
- **Cache**: memoize embeddings for identical queries within a session; cache top results keyed by normalized query.

### Context Budgeting (V1)
- Default token cap: 1,200 tokens for retrieved context (configurable via `VITE_RETRIEVAL_CONTEXT_TOKENS`).
- V1 packing: simple merge of adjacent chunks (same doc/page) and append in similarity order until the cap is reached; stop when the next chunk would exceed the cap.
- Token estimate: fast character/4 heuristic (good enough for budgeting).

### Context Budgeting (Phase 2)
- Upgrade to the richer packing heuristic (contiguity preference, smarter overage trimming, model-aware tokenizer) once V1 is stable.

### Latency & Warmup
- Hot-path target: <250 ms once worker + model are loaded.
- Cold-start: worker spawn and model load will exceed the target. Mitigations:
  - Pre-warm at app load or right after first document embed via `warmupEmbeddingModel`.
  - Keep a single long-lived worker; only respawn on failure (see guardrails).
  - Cache the model in the worker between queries; avoid clearing unless low on memory.
- UX: if a cold start is detected, show a brief “warming up retrieval” state; don’t apply the 250 ms expectation to that first call.

## Edge Cases & Guardrails
- Empty or ultra-short queries → short-circuit with empty result.
- Model mismatch (stored embeddings not matching current `MODEL_ID`) → return empty and prompt user to re-embed.
- Return signal for mismatch/error: set `reason = 'model_mismatch'` (or `'error'`) while returning an empty `results` array so the UI can show “Please re-embed your documents” instead of a generic “No results.”
- Model updates: if `MODEL_ID` changes, run a maintenance step to delete/clear `chunk_embeddings` for the old model and set `document_chunks.embedded = false` so the embedding pipeline reprocesses; alternatively, add a one-off migration that truncates `chunk_embeddings` and resets the flag.
- Abort handling: propagate `AbortSignal` through embed + query.
- Privacy: all computation stays local; no remote calls.
- Missing embed worker: if `embedQuery` cannot reach the worker (not registered, load failure), surface a user-visible error state in the UI (e.g., toast/banner) and log the error to the console/telemetry so it can be diagnosed; do not silently fall back to remote models.
- Worker restart: implement a lazy singleton factory (`getEmbeddingWorker`) that recreates the worker if the cached instance errors, times out, or was terminated. On failure: terminate current worker, clear the cached promise, respawn, and retry once. Provide a manual `restartEmbeddingWorker()` hook the UI can call after showing the error. Use a small watchdog/ping to detect dead workers.
- DB/migration failure: if the local DB is unavailable or an index migration is missing/fails, log the error (console/telemetry) and return an empty context string/empty result set so the model can still answer without retrieved context; avoid throwing to the UI in normal chat flow.

## Next Steps (actionable)
1. Implement `src/lib/retrieval.ts` with the V1 pipeline and tests against a small fixture dataset.
2. Add migration for vector index (create HNSW, keep IVFFlat as optional fallback).
3. Wire a `getInformation` tool for chat that uses `retrieveChunks`.
4. Add a dev UI toggle to show the raw retrieved chunks for a query to aid tuning.
5. Tune similarity floor and `k` using the manual Q/A set; document recommended defaults in code comments.
