# Embedding Implementation

This document details the implementation of the in-browser embedding generation pipeline for Local RAG.

## Overview

The embedding system generates vector embeddings for document chunks using the `Xenova/all-MiniLM-L6-v2` model via `@built-in-ai/transformers-js`. To ensure the UI remains responsive, the heavy lifting of model inference is offloaded to a dedicated Web Worker.

### Model Selection Rationale

The system originally used `onnx-community/embeddinggemma-300m-ONNX` (768 dimensions), but was switched to `Xenova/all-MiniLM-L6-v2` (384 dimensions) for the following reasons:

1. **Retrieval Quality**: During testing, embeddinggemma showed poor semantic similarity scores for factual Q&A queries. For example, a query about "When was Stargate Atlantis cancelled?" would return chunks with ~0.46 similarity while unrelated chunks scored ~0.66.

2. **Established Performance**: all-MiniLM-L6-v2 is a well-tested sentence transformer model with known good performance on semantic search tasks.

3. **Smaller Footprint**: 384 dimensions vs 768 dimensions reduces storage requirements and speeds up vector similarity calculations.

4. **Faster Inference**: The smaller model runs faster on client-side hardware, improving the user experience during document upload.

> **Note**: Even with the model change, pure vector search has limitations for factual queries. The retrieval system now uses a hybrid approach combining vector similarity with trigram keyword search. See [retrieval-impl.md](./retrieval-impl.md) for details.

## Architecture

The system follows a **Main Thread Controller / Worker Executor** pattern:

1.  **Main Thread**: Manages UI state, database interactions (via `db.worker.ts`), and orchestrates the embedding process.
2.  **Embedding Worker**: A dedicated worker that holds the model instance and performs inference.
3.  **Database**: Stores chunks and their corresponding embeddings.

### Key Components

| Component | File | Description |
| :--- | :--- | :--- |
| **Worker** | `src/workers/embedding.worker.ts` | Runs the embedding model. Handles `warmup`, `embed-batch`, and `clear-cache` messages. |
| **Worker Client** | `src/lib/embedding-worker.ts` | Provides a type-safe API (`warmupEmbeddingModel`, `embedBatchWorker`) to communicate with the worker. |
| **Controller** | `src/lib/embedding-controller.ts` | Orchestrates the pipeline: fetches chunks from DB, sends to worker, saves results. |
| **Storage** | `src/lib/doc-storage.ts` | DB helpers for fetching unembedded chunks and saving vector embeddings. |
| **UI Provider** | `src/providers/document-upload.tsx` | Integrates embedding into the upload workflow and visualizes progress. |

## Data Flow

The embedding process is triggered automatically after a document is uploaded and chunked.

1.  **Trigger**: `DocumentUploadProvider` finishes chunking a file.
2.  **Warmup**: Calls `warmupEmbeddingModel()` to ensure the worker has the model loaded (downloading if necessary).
3.  **Batch Processing Loop** (in `embedDocument` controller):
    *   **Fetch**: Queries `document_chunks` table for chunks where `embedded = false` (limit 32).
    *   **Send**: Sends text chunks to the worker via `embedBatchWorker`.
    *   **Inference**:
        *   Worker receives chunks.
        *   Runs `ai.embedMany` using the `transformers.js` model.
        *   Packs the resulting `number[][]` embeddings into a flat `Float32Array` for efficient transfer.
        *   Transfers the buffer back to the main thread.
    *   **Persist**: Main thread unpacks the buffer and calls `saveChunkEmbeddings`.
        *   Inserts rows into `chunk_embeddings`.
        *   Updates `document_chunks` setting `embedded = true`.
    *   **Progress**: Updates the UI progress bar (mapped to 60-100% of the total upload flow).
4.  **Completion**: Loop terminates when no unembedded chunks remain.

## Worker Implementation Details

### Message Protocol

The worker communicates via a typed message protocol:

-   **Requests**:
    -   `{ type: 'warmup' }`: Initialize model.
    -   `{ type: 'embed-batch', docId, chunks, batchId }`: Process a batch of text.
    -   `{ type: 'clear-cache' }`: Clear model weights.
-   **Responses**:
    -   `{ type: 'progress', progress }`: Download progress.
    -   `{ type: 'result', batchId, buffer, dims, ... }`: Successful embedding batch.
    -   `{ type: 'error', error }`: Failure.

### Memory Management

-   **Transferables**: The embedding vectors are returned as a `Float32Array` buffer and transferred (not cloned) from the worker to the main thread to minimize overhead.
-   **Batching**: Chunks are processed in batches of 32 to prevent Out-Of-Memory (OOM) errors on lower-end devices.

## Database Schema

The implementation relies on the following schema updates in `src/db/schema.ts`:

-   `document_chunks`: Added `embedded` boolean flag (default `false`).
-   `chunk_embeddings`: Stores the vector data.
    -   `chunkId`: FK to `document_chunks`.
    -   `embedding`: `vector(384)` column (reduced from 768 after model change).
    -   `embeddingModel`: Identifier for the model used.

## UI Integration

-   **Upload Progress**: The upload progress bar now includes the embedding phase.
    -   0-30%: File Upload
    -   30-60%: Chunking (PDF/Markdown processing)
    -   60-100%: Embedding Generation
-   **Model Management**: The `EmbeddingModelDownload` component uses the worker client to manage model downloads and cache clearing, ensuring the main thread doesn't accidentally instantiate a duplicate model.
