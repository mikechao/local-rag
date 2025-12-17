import type {
  EmbeddingWorkerMessage,
  EmbeddingWorkerResponse,
} from "../workers/embedding.worker";

let worker: Worker | null = null;
let warmupPromise: Promise<void> | null = null;

export function getEmbeddingWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL("../workers/embedding.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
  }
  return worker;
}

export function terminateEmbeddingWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    warmupPromise = null;
  }
}

type WarmupOptions = {
  onProgress?: (progress: number) => void;
};

export function warmupEmbeddingModel(options: WarmupOptions = {}) {
  if (warmupPromise) return warmupPromise;

  const w = getEmbeddingWorker();

  warmupPromise = new Promise((resolve, reject) => {
    const handler = (event: MessageEvent<EmbeddingWorkerResponse>) => {
      const { type } = event.data;
      if (type === "progress") {
        options.onProgress?.(event.data.progress);
      } else if (type === "warmup-complete") {
        w.removeEventListener("message", handler);
        resolve();
      } else if (type === "error") {
        w.removeEventListener("message", handler);
        reject(event.data.error);
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ type: "warmup" } satisfies EmbeddingWorkerMessage);
  });

  return warmupPromise;
}

export function clearEmbeddingCacheWorker() {
  const w = getEmbeddingWorker();
  return new Promise<void>((resolve, reject) => {
    const handler = (event: MessageEvent<EmbeddingWorkerResponse>) => {
      const { type } = event.data;
      if (type === "cache-cleared") {
        w.removeEventListener("message", handler);
        resolve();
      } else if (type === "error") {
        w.removeEventListener("message", handler);
        reject(event.data.error);
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ type: "clear-cache" } satisfies EmbeddingWorkerMessage);
  });
}

export function embedBatchWorker(
  docId: string,
  chunks: string[],
  batchId: string,
): Promise<{
  batchId: string;
  docId: string;
  dims: number;
  buffer: ArrayBuffer;
}> {
  const w = getEmbeddingWorker();
  return new Promise((resolve, reject) => {
    const handler = (event: MessageEvent<EmbeddingWorkerResponse>) => {
      const { type } = event.data;
      if (type === "result" && event.data.batchId === batchId) {
        w.removeEventListener("message", handler);
        resolve({
          batchId: event.data.batchId,
          docId: event.data.docId,
          dims: event.data.dims,
          buffer: event.data.buffer,
        });
      } else if (type === "error" && event.data.meta?.batchId === batchId) {
        w.removeEventListener("message", handler);
        reject(event.data.error);
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({
      type: "embed-batch",
      docId,
      chunks,
      batchId,
    } satisfies EmbeddingWorkerMessage);
  });
}

export async function embedQuery(text: string): Promise<number[]> {
  const batchId = crypto.randomUUID();
  const result = await embedBatchWorker("query", [text], batchId);
  const floatArray = new Float32Array(result.buffer);
  return Array.from(floatArray);
}
