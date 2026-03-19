# local-rag

Local-first RAG web app that runs entirely in the browser, including embeddings, retrieval, local storage, and on-device model access once weights are cached.

## What It Does

- Upload PDFs or Markdown files
- Chunk content and generate embeddings in a Web Worker
- Store documents and vectors in browser-local Postgres via PGlite
- Retrieve context with hybrid search that combines vector and keyword matching
- Use published `@browser-ai/*` packages for browser-native text, embedding, transcription, and model warmup flows

## Tech Stack

- App runtime: Vite + TanStack Router
- UI: React 19, Radix UI, Tailwind CSS
- Local database: PGlite + Drizzle ORM
- Embedding model: `Xenova/all-MiniLM-L6-v2` via `@browser-ai/transformers-js`
- RAG SDK: Vercel AI SDK (`ai`, `@ai-sdk/react`)
- Retrieval: pgvector cosine similarity + `pg_trgm` trigram search
- Workers: dedicated browser workers for DB access, blob loading, and embeddings

## Getting Started

Install dependencies once from the repo root:

```bash
pnpm install
```

Start the app:

```bash
pnpm dev
```

Default URL: `http://localhost:3000`

## Common Commands

- `pnpm dev` — start the local dev server on port 3000
- `pnpm build` — create the production client build
- `pnpm serve` — preview the production build locally
- `pnpm test` — run Vitest suites
- `pnpm typecheck` — run `tsc --noEmit`
- `pnpm lint` — run Biome linting
- `pnpm format` — run Biome formatting
- `pnpm check` — run Biome checks
- `pnpm db:generate` — generate Drizzle migration output

## Local-First and Offline

All document processing, embedding, storage, and retrieval run in the browser. After model weights are downloaded, the app is designed to continue working offline.

## Deployment Notes

The production output is a static Vite build under `dist/`. Serve that directory from any static host that rewrites unknown application routes such as `/chat` and `/documents` to the app entry document so TanStack Router can handle navigation in the browser.

## Retrieval Pipeline Overview

### 1. Chunking

- PDF: `WebPDFLoader` + `RecursiveCharacterTextSplitter`
- Markdown: `MarkdownTextSplitter`
- Default settings: `chunkSize: 1000`, `chunkOverlap: 150`

### 2. Embedding

- Runs in a dedicated worker to keep the UI responsive
- Uses `Xenova/all-MiniLM-L6-v2` with 384 dimensions
- Processes chunks in batches and stores vectors in `chunk_embeddings`

### 3. Retrieval

- Vector search: cosine similarity over pgvector embeddings
- Keyword search: trigram matching via `pg_trgm`
- Fusion: reciprocal rank fusion merges both rankings

### 4. Reranking

- Optional on-device reranking with `mixedbread-ai/mxbai-rerank-xsmall-v1`
- Results below the configured score threshold are filtered out

More implementation detail lives in:

- `docs/chunking-impl.md`
- `docs/embedding-impl.md`
- `docs/retrieval-impl.md`

## Maintenance

### Clear the local OPFS database

Useful snippet to run in the browser DevTools console to delete the OPFS data used by PGlite:

```js
(async () => {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry("local-rag", { recursive: true });
    console.log("Database deleted successfully.");
  } catch (e) {
    console.log("Could not delete 'local-rag' directly. Deleting all OPFS entries...");
    for await (const [name] of root.entries()) {
      await root.removeEntry(name, { recursive: true });
      console.log(`Deleted: ${name}`);
    }
    console.log("All OPFS data cleared.");
  }
})();
```

If the OPFS directory name ever changes in `src/workers/db.worker.ts` or `src/workers/blob.worker.ts`, update the snippet to match.
