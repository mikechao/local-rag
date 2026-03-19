# Project Context: Local RAG Monorepo

## Overview
This repository contains a **Client-Side Retrieval-Augmented Generation (RAG)** application (`local-rag`) and a vendored reference copy of supporting browser AI packages (`built-in-ai`). The project is a **Monorepo** managed by TurboRepo.

**Key Characteristic:** The entire stack runs locally in the user's browser. No external backend server is required for inference or database storage. It utilizes WebAssembly (WASM), Web Workers, and the Origin Private File System (OPFS) to achieve this.

## Architecture

### 1. `apps/local-rag` (Main Application)
The user-facing interface for chatting with documents.
*   **Framework**: React + Vite + TanStack Router.
*   **Styling**: Tailwind CSS.
*   **Database**: [PGlite](https://pglite.dev/) (Postgres in WASM) with `pgvector` support.
    *   **Persistence**: Data is stored in OPFS (Origin Private File System).
    *   **ORM**: Drizzle ORM.
*   **RAG Pipeline**:
    *   **Ingestion**: Files (PDFs, etc.) are uploaded and processed in the browser.
    *   **Chunking**: Text is split into manageable chunks.
    *   **Embedding**: Uses local models (via `transformers.js`) to generate vectors (384 dimensions).
    *   **Retrieval**: Implements **Hybrid Search** combining:
        1.  **Vector Similarity**: Cosine distance using `pgvector`.
        2.  **Keyword Search**: Trigram similarity using `pg_trgm`.
        3.  **Re-ranking**: Reciprocal Rank Fusion (RRF) combines results.
*   **Workers**: Heavy lifting (database queries, embedding generation) is offloaded to Web Workers (`src/workers/`) to keep the UI fluid.
*   **Deployment**: Configured for Cloudflare Workers/Pages (`wrangler.jsonc`).

### 2. `packages/built-in-ai` (Vendored Reference Copy)
A vendored copy of packages that bridge the Vercel AI SDK with browser-native model execution. `apps/local-rag` now depends on the published `@browser-ai/*` packages instead of these workspace packages.
*   **`@browser-ai/core`**: Adapter for the experimental Chrome/Edge **Prompt API** (Gemini Nano built into the browser).
*   **`@browser-ai/transformers-js`**: Adapter for [Transformers.js](https://huggingface.co/docs/transformers.js), allowing execution of Hugging Face models (e.g., for embeddings or chat) using WebGPU.
*   **`@built-in-ai/web-llm`**: Present in the vendored copy for reference.

## Key Directories & Files

### `apps/local-rag/`
*   `src/routes/`: Application pages (Chat, Documents, Models).
*   `src/db/schema.ts`: Drizzle schema defining `documents`, `document_chunks`, and `chunk_embeddings`.
*   `src/lib/`: Core logic.
    *   `retrieval.ts`: The hybrid search and RRF implementation.
    *   `embedding-worker.ts`: Handles vector generation in a background thread.
    *   `db.ts`: Database initialization and connection.
*   `src/workers/`: Entry points for the various web workers.

## Tech Stack Summary
*   **Language**: TypeScript
*   **Monorepo**: TurboRepo + PNPM
*   **Frontend**: React, Vite
*   **Database**: PGlite (Postgres WASM), Drizzle ORM
*   **AI/ML**: Transformers.js, Vercel AI SDK, WebGPU
*   **Platform**: Cloudflare Pages (Static serving + Workers for headers/config)

## Development
*   **Package Manager**: `pnpm`
*   **Build System**: `turbo`
*   **Scripts**:
    *   `pnpm dev`: Starts the dev server tasks for the active workspace members.
    *   `pnpm build`: Builds the production assets.

## Conventions
*   **Imports**: Standard ESM imports.
*   **Styling**: Utility-first with Tailwind CSS.
*   **State Management**: React Hooks + URL state (via TanStack Router).
*   **Async**: Extensive use of `async/await` and Web Workers for performance-critical tasks.
