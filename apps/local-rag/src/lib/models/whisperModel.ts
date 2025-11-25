import { transformersJS } from "@built-in-ai/transformers-js";

export const MODEL_ID = "Xenova/whisper-base";
export const LOCAL_READY_KEY = "whisper-base-ready";

export function getWhisperModel() {
  return transformersJS.transcription(MODEL_ID);
}

export async function hasCachedWhisperWeights(): Promise<boolean> {
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

export function isWhisperModelReadyFlag(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
  return localStorage.getItem(LOCAL_READY_KEY) === "true";
}

export async function clearWhisperCache() {
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
