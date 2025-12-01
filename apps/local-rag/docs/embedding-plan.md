# Embedding Plan

Goal: generate embeddings for chunked documents in-browser using the Vercel AI SDK `embed/embedMany` APIs with the `@built-in-ai/transformers-js` model `onnx-community/embeddinggemma-300m-ONNX`, without blocking the main UI thread.

## 1. Architecture
- **Worker-only**: run the embedding pipeline in a dedicated web worker to keep React responsive; if worker init fails, surface the error in UI and skip main-thread fallback to avoid double downloads and duplicated sessions. Target Chrome (WebGPU in workers); if `navigator.gpu` is absent/blocked, log the condition and fall back to CPU.
- **Model single source**: reuse `MODEL_ID`/helpers from `src/lib/models/embeddingModel.ts` so UI + worker share config and cache behavior.
- **Data flow**: main-thread controller pulls `document_chunks` via `db.worker.ts` (embedded=false) → sends batches to the embedding worker → embedding worker runs Vercel AI SDK `embedMany` with `transformersJS.textEmbedding(MODEL_ID, ...)` → returns vectors → main thread relays to `db.worker.ts` for `chunk_embeddings` inserts and `embedded` flag updates.
- **Transport**: main thread posts commands to the embedding worker; embedding worker streams progress/results back; main thread relays persistence payloads to `db.worker.ts` (PGlite worker wrapper does not expose direct worker↔worker messaging, so main-thread relay is required). Vector payloads must be sent as Transferable `ArrayBuffer`/`Float32Array` to avoid structured-clone overhead on each hop; standardize result shape to `{ type: 'result', batchId, docId, dims, chunkIds: string[], buffer: ArrayBuffer }` where `buffer` is a packed `Float32Array` of length `chunkIds.length * dims`.

## 2. Worker API (proposal)
- Message types
  - `warmup`: downloads model via `ensureEmbeddingModelReady` (worker-safe; uses no `window`/`localStorage`) and reports progress. Prefer `device: 'webgpu'` when `navigator.gpu` exists; fall back to CPU otherwise.
  - `embed-batch`: payload `{ docId, chunks: Chunk[], batchId }`; returns `{ batchId, embeddings: number[][] }`.
  - `clear-cache`: calls a worker-safe `clearEmbeddingCache` (use `globalThis` guards so `caches`/`localStorage` access works in workers) to drop weights for troubleshooting/storage control.
- Responses include `{ type: 'progress' | 'result' | 'error', meta }` to drive UI toasts/bars.

## 3. Embedding pipeline steps
1) **Fetch work**: UI/service queries `document_chunks` where `embedded = false`, limited to a batch size (e.g., 64) to cap memory.
2) **Warmup**: send `warmup` to worker early (right after chunking completes or when the app loads). Show a spinner tied to `createSessionWithProgress` callbacks.
3) **Embed**: worker calls Vercel AI SDK `embedMany({ model: transformersJS.textEmbedding(MODEL_ID, { device: MODEL_DEVICE }), values: chunks.map(c => c.text) })`.
   - After the first batch, assert `embedding.length === EXPECTED_DIM` (define once alongside DB schema, e.g., `src/db/schema.ts` and re-export to worker code). If mismatch, abort and surface a configuration error to the UI + telemetry before persisting.
4) **Persist**: main thread receives vectors and forwards them to `db.worker.ts`, which writes `chunk_embeddings` rows and flips `embedded = true` for those chunk IDs.
5) **Iterate**: loop until no remaining unembedded chunks; support pause/resume by persisting progress state.

## 4. Batching & performance guardrails
- Start with batch size 32–64 values; expose a configurable limit for low-memory devices.
- If a batch fails with OOM, halve the batch size and retry once before surfacing an error.
- Prefer `device: 'webgpu'` (per current config); automatically fall back to CPU if `availability()` reports otherwise.
- Keep strings trimmed; skip empty/whitespace-only chunks before embedding.

## 5. UI integration
- Reuse the upload/chunking progress UI: add an “Embedding” phase (e.g., 100–150% progress range) to avoid redesign.
- Show dimension info from the first returned vector (`embedding.length`) for transparency in logs/debug panel.
- Add a “Clear model cache” control hooked to `clear-cache` to free space if needed.

## 6. Error handling & resilience
- Distinguish network/download errors (model fetch) vs runtime OOM; map to actionable UI copy.
- On worker crash: surface toast, allow retry; keep partial progress because already-persisted embeddings are idempotent.
- If worker init fails: show an explicit error state and collect/log error details; no main-thread fallback embedding is attempted.
- If a chunk persist fails, keep `embedded = false` so it is picked up on the next run.

## 7. Validation & testing
- Quick harness: run `embedMany` on 3–5 sample strings and assert all vectors share the same length (must equal schema dimension, currently 768) and are finite numbers; fail fast if the dimension differs.
- Integration check: after a run, query `document_chunks` to confirm `embedded` flags match `chunk_embeddings` count.
- Manual UI check: upload a doc, watch Upload → Chunking → Embedding phases without main-thread jank (scroll/typing stays smooth).

## 8. Next implementation steps
1) Refactor model init/download so **only the embedding worker** calls `createSessionWithProgress`; remove main-thread instantiation to avoid double downloads and make the worker the single owner of the model session/cache.
2) Add the dedicated embedding worker (e.g., `src/workers/embedding.worker.ts`) that wraps `ensureEmbeddingModelReady`, Vercel AI SDK `embedMany`, and message handlers.
3) Update `src/components/model-download/EmbeddingGemmaDownload.tsx` to drive worker `warmup`/`clear-cache` messages (worker runs `ensureEmbeddingModelReady` + Vercel AI SDK `embedMany`), instead of calling `ensureEmbeddingModelReady` or creating a model on the main thread.
4) Keep persistence in the existing `db.worker.ts`; have the main-thread controller queue batches, send `embed-batch` to the embedding worker, then forward results to the DB worker for inserts/flag updates (plus UI progress/pause/resume handling).
5) Extend the upload pipeline to enqueue embedding after chunking completes.
6) Add feature flag/setting to auto-embed vs manual “Generate embeddings” button.
7) Document env assumptions (browser with WebGPU or CPU fallback; offline-first caches) in README.
