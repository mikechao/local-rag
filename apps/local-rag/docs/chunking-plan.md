# Document Chunking Plan (PDF + Markdown)

## Goals
- Convert uploaded PDFs and Markdown into uniform text chunks ready for embedding.
- Preserve useful metadata (source, location, page/section) for retrieval.
- Support progress feedback, especially for large PDFs.
- Keep the pipeline streaming-friendly and reusable.

## Markdown
- Loader: `MarkdownTextSplitter` from `@langchain/textsplitters`.
- Strategy: split by headers first, then recursive character fallback.
- Defaults to start with `chunkSize ≈ 1,000` characters, `chunkOverlap ≈ 150`; adjust per quality checks.
- Metadata per chunk: `{ sourcePath, docType: "markdown", headingPath (h1>h2>...), chunkIndex }`.

## PDF
- Loader: in-browser/worker use `WebPDFLoader` from `@langchain/community/document_loaders/web/pdf` (pdfjs-based); only use `PDFLoader` from `/fs/pdf` in a Node context.
- Text splitting: `RecursiveCharacterTextSplitter` with the same base settings (`chunkSize ≈ 1,000`, `chunkOverlap ≈ 150`).
- Preserve per-page context before splitting: attach `pageNumber`, `totalPages`, and `sourcePath`.
- Heading metadata: PDF loaders do not provide heading hierarchies by default; set `heading_path = null` unless you add an optional outline extraction (pdfjs `getOutline`) and map bookmarks to page ranges.
- OCR: default off. Detect “no text layer” by checking extracted text on page 1; if empty, halt chunking, warn the user, and offer to re-run with OCR enabled.
- OCR default: off (use native text layer). Add a toggle to enable OCR per document if text layer is missing; surface a warning when no text is detected.
- Loading strategy (PGlite + lo): `WebPDFLoader` expects a `Blob`/`ArrayBuffer` or URL; it does not accept `PDFDataRangeTransport` directly. Stream bytes via the blob worker (`lo_get` ranges) and build a `Blob` from chunk slices (`new Blob([chunk1, chunk2, ...])`) with progress callbacks. The full Blob still lives in memory before parsing; splitting starts after download completes.
- Future big-file work (not in current scope):
  - Enforce/raise max PDF size guardrail in browser path as needed.
  - “Offline heavy ingest” via desktop wrapper or companion helper using `/fs/pdf`, sharing the same PGlite data directory; UI would poll DB for status.
  - Custom pdfjs per-page text extractor that streams via range requests for incremental chunking.

## Progress / Streaming
- Web path: two phases—(1) download progress (bytes fetched via `lo_get` ranges into a Blob), (2) split progress once the Blob is ready (pages processed, chunks emitted).
- If a Node `/fs/pdf` path is added later, `splitPages: true` can stream page-by-page there; not available in-browser with WebPDFLoader.
- Progress event shape: `{ docId, filename, stage: "download" | "split", bytesDone?, bytesTotal?, pagesDone?, pagesTotal?, chunksDone?, chunksTotal? }`.
- Channel: worker `postMessage` with `type: "chunk-progress"` payload shaped as above; UI listens on the provider and updates a persistent toast.
- Run chunking in a dedicated web worker (reuse existing blob worker or add a chunker worker) to avoid blocking the UI thread; UI subscribes to progress events.

## Storage for Chunks (pre-embedding)
- Source of truth: PGlite (Drizzle models).
- Ingestion manifest: reuse existing `documents` table. Columns: `id` (pk, text), `filename`, `mime`, `size`, `blob_oid`, `created_at`, `updated_at`; optional config columns if needed (`splitter`, `chunk_size`, `chunk_overlap`, `doc_type`, `config_version`).
- Chunks: evolve `doc_text` -> `document_chunks`:
  - Columns: `id` (pk, text hash of document_id + page_number + chunk_index), `document_id` (fk -> documents.id on delete cascade), `doc_type` text, `page_number` int, `chunk_index` int, `heading_path` text nullable, `text` text, `created_at` timestamptz default now, `embedded` boolean default false.
  - Indexes: (document_id), (document_id, page_number), (embedded).
- Embeddings: evolve `embeddings` -> `chunk_embeddings`:
  - Columns: `chunk_id` (fk -> document_chunks.id on delete cascade), `embedding_model` text, `embedding` vector, `created_at` timestamptz default now.
  - Primary key: (`chunk_id`, `embedding_model`) to allow multiple models per chunk (future A/B).
- JSONL not required; omit unless a one-off export is explicitly needed.
- Manifest defaults: use global splitter settings unless a document explicitly overrides via optional config columns; keep the columns nullable and treat absence as “use global defaults”.

## Embedding Pipeline (separate step)
- Embedding worker queries PGlite directly: `SELECT * FROM document_chunks WHERE embedded = false ORDER BY created_at`.
- For each chunk, compute embedding, write to `chunk_embeddings`, then set `embedded = true`.
- Vector store: `chunk_embeddings` uses pgvector inside PGlite (extension already present in workers). If a remote/external store is ever used, add a sync job; otherwise PGlite is authoritative.
- Keep an ingestion manifest table (metadata) noting: sourcePath, docType, splitter settings, chunkCount, embeddingModel, vectorStore target (PGlite/pgvector by default).
  - Use `documents` as the manifest; optional columns if per-document variance is needed (e.g., `splitter`, `chunk_size`, `chunk_overlap`, `doc_type`, `config_version`). If chunking settings are globally fixed, keep this in config and skip extra columns.

## Quality Checks / Tuning
- Run quick diagnostics: average chunk length, max length, and overlap ratio after split.
- If hallucinations or context loss appear, adjust `chunkSize` up (fewer, larger chunks) or `chunkOverlap` up (more shared context).
- Spot-check a few chunks per doc type to ensure headers/page numbers are present in metadata.

## Error Handling / Limits
- Enforce max file size (configurable) and page count guardrails; suggested defaults: reject >500MB or >1,000 pages in-browser; allow override via settings.
- On guardrail hit: block chunking, show actionable message (“Too large for in-browser; use desktop ingest” when available).
- If no text is detected on the first page of a PDF, stop processing and show a toast: “No text detected on page 1. Soon: Retry with OCR.” (keep OCR as a future implementation toggle).
- For very large-but-allowed PDFs, show a toast after upload starts: “Large PDF will load fully into memory; close heavy tabs if RAM is limited.” Toast auto-dismiss after a few seconds.
- For gigantic PDFs, optionally cap pages per run and allow resume using the manifest + deterministic ids.
- Log loader/splitter errors with sourcePath and pageNumber for triage.

## Next Steps to Implement
1) Add loader + splitter utilities (markdown/pdf) that emit async progress events.
2) Define the schema updates in Drizzle models, then run the Drizzle CLI to auto-generate and commit migrations: keep `documents` as manifest; evolve `doc_text` -> `document_chunks` and `embeddings` -> `chunk_embeddings` (heading_path, embedded flag, FK to chunks, indexes, composite PK chunk_id+embedding_model).
3) Hook upload flow (`useDocumentUpload` provider): after file lands, start a transaction, delete existing `document_chunks` (cascade clears `chunk_embeddings`), then insert fresh chunks; stream progress (download + split); mark upload as “done” only after chunks are stored.
4) Add a PDF loader adapter that reuses the blob worker’s `START_PDF_STREAM` + `GET_PDF_RANGE` to build the Blob for WebPDFLoader; include graceful fallback to full-blob read for small files.
5) Emit a UI toast/side-panel status showing “Uploading → Chunking → Ready for embedding”.
6) (Optional) Add a lightweight preview helper to spot-check chunks + stats directly from PGlite.
