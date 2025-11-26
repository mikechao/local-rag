import { transformersJS } from "@built-in-ai/transformers-js";

export const MODEL_ID = "Xenova/speecht5_tts";
export const LOCAL_READY_KEY = "speecht5-tts-ready";

let speechWorker: Worker | undefined;

export function getSpeechModel() {
  if (typeof window !== "undefined" && !speechWorker) {
    speechWorker = new Worker(
      new URL("../../workers/speech.worker.ts", import.meta.url),
      { type: "module" },
    );
  }

  return transformersJS.textToSpeech(MODEL_ID, {
    dtype: "fp32",
    device: "wasm",
    worker: speechWorker,
  });
}

export async function hasCachedSpeechWeights(): Promise<boolean> {
  if (typeof window === "undefined" || typeof caches === "undefined") return false;
  const keys = await caches.keys();
  for (const key of keys) {
    if (!key.includes("transformers")) continue;
    const cache = await caches.open(key);
    const requests = await cache.keys();
    if (requests.some((req) => req.url.includes(MODEL_ID))) return true;
  }
  return false;
}

export function isSpeechModelReadyFlag(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
  return localStorage.getItem(LOCAL_READY_KEY) === "true";
}

export async function clearSpeechCache() {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.removeItem(LOCAL_READY_KEY);
  }

  if (typeof window !== "undefined" && typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.includes("transformers"))
        .map((k) => caches.delete(k)),
    );
  }
}
