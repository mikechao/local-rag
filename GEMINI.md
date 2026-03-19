# Project Context: local-rag

## Overview
This repository contains a single **Client-Side Retrieval-Augmented Generation (RAG)** application called `local-rag`. The full stack runs locally in the user's browser. No external backend server is required for inference or database storage. It uses WebAssembly (WASM), Web Workers, and the Origin Private File System (OPFS).

## Architecture

The user-facing interface for chatting with documents lives at the repository root.

*   **Framework**: React + Vite + TanStack Router.
*   **Styling**: Tailwind CSS.
*   **Database**: [PGlite](https://pglite.dev/) (Postgres in WASM) with `pgvector` support.
    *   **Persistence**: Data is stored in OPFS (Origin Private File System).
    *   **ORM**: Drizzle ORM.
*   **RAG Pipeline**:
    *   **Ingestion**: Files (PDFs, etc.) are uploaded and processed in the browser.
    *   **Chunking**: Text is split into manageable chunks.
    *   **Embedding**: Uses `@browser-ai/transformers-js` to generate vectors (384 dimensions).
    *   **Retrieval**: Hybrid search combines vector similarity and trigram keyword search.
    *   **Re-ranking**: Optional local reranking refines candidates after retrieval.
*   **Workers**: Heavy lifting (database queries, blob loading, embedding generation) is offloaded to Web Workers under `src/workers/`.
*   **Deployment**: Built as static assets with Vite and can be hosted on any static platform with history fallback for app routes.

## Key Directories & Files

### Root application files
*   `src/routes/`: Application pages (Chat, Documents, Models).
*   `src/db/schema.ts`: Drizzle schema defining `documents`, `document_chunks`, and `chunk_embeddings`.
*   `src/lib/`: Core logic.
    *   `retrieval.ts`: The hybrid search and RRF implementation.
    *   `embedding-worker.ts`: Handles vector generation in a background thread.
    *   `db.ts`: Database initialization and connection.
*   `src/workers/`: Entry points for the various web workers.
*   `test/`: Vitest coverage for app and provider integration behavior.
*   `public/`: Static assets such as logos, theme initialization, and local voice assets.

## Tech Stack Summary
*   **Language**: TypeScript
*   **Package Manager**: PNPM
*   **Frontend**: React, Vite
*   **Database**: PGlite (Postgres WASM), Drizzle ORM
*   **AI/ML**: `@browser-ai/*`, Transformers.js, Vercel AI SDK, WebGPU
*   **Platform**: Static hosting with route rewrites to the entry document

## Development
*   **Scripts**:
    *   `pnpm dev`: Starts the dev server on port 3000.
    *   `pnpm test`: Runs the Vitest suite.
    *   `pnpm typecheck`: Runs TypeScript without emitting files.
    *   `pnpm build`: Builds the production assets.

## Conventions
*   **Imports**: Standard ESM imports.
*   **Styling**: Utility-first with Tailwind CSS.
*   **State Management**: React Hooks + URL state (via TanStack Router).
*   **Async**: Extensive use of `async/await` and Web Workers for performance-critical tasks.
