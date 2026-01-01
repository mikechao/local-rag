import { transformersJS } from "@built-in-ai/transformers-js";
import { cleanClearCahce } from "./utils";

export const MODEL_ID = "Xenova/whisper-base";
export const LOCAL_READY_KEY = "whisper-base-ready";

let modelSingleton: ReturnType<typeof transformersJS.transcription> | null =
  null;

export function getWhisperModel() {
  if (!modelSingleton) {
    modelSingleton = transformersJS.transcription(MODEL_ID);
  }
  return modelSingleton;
}

export async function hasCachedWhisperWeights(): Promise<boolean> {
  if (typeof window === "undefined" || typeof caches === "undefined")
    return false;
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
  if (typeof window === "undefined" || typeof localStorage === "undefined")
    return false;
  return localStorage.getItem(LOCAL_READY_KEY) === "true";
}

export async function clearWhisperCache() {
  await cleanClearCahce(MODEL_ID, LOCAL_READY_KEY);
}
