import {
  ensureEmbeddingModelReady,
  getModel,
  clearEmbeddingCache,
} from "../lib/models/embeddingModel";

// Define message types
export type EmbeddingWorkerMessage =
  | { type: "warmup" }
  | { type: "embed-batch"; docId: string; chunks: string[]; batchId: string }
  | { type: "clear-cache" };

export type EmbeddingWorkerResponse =
  | { type: "progress"; progress: number }
  | {
      type: "result";
      batchId: string;
      docId: string;
      dims: number;
      chunkIds?: string[]; // Optional, if we want to pass back chunk IDs
      buffer: ArrayBuffer; // Float32Array buffer
    }
  | { type: "error"; error: string; meta?: any }
  | { type: "warmup-complete" }
  | { type: "cache-cleared" };

const ctx: Worker = self as any;

ctx.onmessage = async (event: MessageEvent<EmbeddingWorkerMessage>) => {
  const { type } = event.data;

  try {
    switch (type) {
      case "warmup":
        await handleWarmup();
        break;
      case "embed-batch":
        // @ts-ignore
        await handleEmbedBatch(event.data);
        break;
      case "clear-cache":
        await handleClearCache();
        break;
    }
  } catch (err: any) {
    ctx.postMessage({
      type: "error",
      error: err.message || "Unknown worker error",
      meta: err,
    });
  }
};

async function handleWarmup() {
  try {
    await ensureEmbeddingModelReady({
      onProgress: ({ progress }) => {
        ctx.postMessage({ type: "progress", progress });
      },
    });
    isModelReady = true;
    ctx.postMessage({ type: "warmup-complete" });
  } catch (error) {
    console.error("Warmup failed", error);
    throw error;
  }
}

import { embedMany } from "ai";

let isModelReady = false;

async function handleEmbedBatch(data: {
  docId: string;
  chunks: string[];
  batchId: string;
}) {
  const { docId, chunks, batchId } = data;
  const model = getModel();

  // Only call ensureEmbeddingModelReady if not already ready
  if (!isModelReady) {
    await ensureEmbeddingModelReady();
    isModelReady = true;
  }

  try {
    const { embeddings } = await embedMany({
      model,
      values: chunks,
    });

    if (embeddings.length === 0) {
      throw new Error("No embeddings returned");
    }

    const dims = embeddings[0].length;
    const totalLength = embeddings.length * dims;
    const buffer = new Float32Array(totalLength);

    for (let i = 0; i < embeddings.length; i++) {
      buffer.set(embeddings[i], i * dims);
    }

    ctx.postMessage(
      {
        type: "result",
        batchId,
        docId,
        dims,
        buffer: buffer.buffer,
      },
      [buffer.buffer],
    );
  } catch (error: any) {
    ctx.postMessage({
      type: "error",
      error: error.message || "Embedding failed",
      meta: { batchId, docId, error },
    });
  }
}

async function handleClearCache() {
  await clearEmbeddingCache();
  ctx.postMessage({ type: "cache-cleared" });
}
