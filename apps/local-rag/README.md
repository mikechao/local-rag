# local-rag

Local-first RAG web app that runs entirely in the browser (including embeddings and retrieval), so it can work offline once models are available.

## What it does

- Upload PDFs or Markdown files
- Chunk content and generate embeddings locally in a Web Worker
- Store data in a browser-based Postgres (PGlite)
- Retrieve context using a hybrid search pipeline (vector + keyword)

## Tech stack

- **App runtime**: Vite + TanStack React Start
- **UI**: React, Radix UI, Tailwind
- **Local database**: PGlite (Postgres in the browser) + Drizzle ORM
- **Embedding model**: `Xenova/all-MiniLM-L6-v2` via `@built-in-ai/transformers-js`
- **RAG SDK**: Vercel AI SDK (`ai`, `@ai-sdk/react`)
- **Retrieval**: pgvector cosine similarity + pg_trgm trigram search, fused with RRF
- **Reranking**: `mixedbread-ai/mxbai-rerank-xsmall-v1` (optional, on-device)
- **Workers**: Web Workers for embeddings and DB I/O

## Local-first & offline

All document processing, embedding, storage, and retrieval run locally in the browser. The app is designed to work offline after the model weights are downloaded.

## Embedding & retrieval pipeline (overview)

### 1) Chunking
- PDF: `WebPDFLoader` (pdfjs) + `RecursiveCharacterTextSplitter`
- Markdown: `MarkdownTextSplitter`
- Default chunking: `chunkSize: 1000`, `chunkOverlap: 150`

### 2) Embedding
- Runs in a dedicated worker to keep the UI responsive
- Uses `Xenova/all-MiniLM-L6-v2` (384 dims) via Transformers.js
- Batches chunks (size 32) and stores vectors in `chunk_embeddings`

### 3) Retrieval
- **Vector search**: cosine similarity on pgvector embeddings
- **Trigram search**: keyword matching via pg_trgm
- **Fusion**: Reciprocal Rank Fusion (RRF) merges both rankings

### 4) Reranking (optional)
- If the reranker model is already cached, the top candidates are reranked
- Results below a configurable `rerankMinScore` threshold are filtered out

See:
- `docs/chunking-impl.md`
- `docs/embedding-impl.md`
- `docs/retrieval-impl.md`

## Development

From the repo root:

```bash
pnpm --filter local-rag dev
```

Default URL: `http://localhost:3000`

## Maintenance

### Clean local database (OPFS)

Helpful snippet to run in the browser DevTools console to delete OPFS used by `db.worker.ts` (PGlite).

```js
(async () => {
  const root = await navigator.storage.getDirectory();
  try {
    // PGlite usually creates a directory matching the name passed to it
    await root.removeEntry("local-rag", { recursive: true });
    console.log("✅ Database deleted successfully.");
  } catch (e) {
    console.log("⚠️ Could not delete 'local-rag' directory directly. Listing all entries...");
    // Fallback: delete everything in OPFS to be sure
    for await (const [name, handle] of root.entries()) {
      await root.removeEntry(name, { recursive: true });
      console.log(`Deleted: ${name}`);
    }
    console.log("✅ All OPFS data cleared.");
  }
})();
```

If you rename the OPFS directory in code (e.g., `OpfsAhpFS("local-rag")`), update the name in the snippet above as well.
