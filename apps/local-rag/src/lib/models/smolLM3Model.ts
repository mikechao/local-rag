import { transformersJS } from "@built-in-ai/transformers-js";
import { cleanClearCahce } from "./utils";

// Centralized model config so UI and routes stay in sync.
export const MODEL_ID = "HuggingFaceTB/SmolLM3-3B-ONNX";
export const MODEL_DEVICE: "auto" | "cpu" | "webgpu" = "auto";
export const LOCAL_READY_KEY = "smollm3-3b-onnx-ready";

type DownloadableLanguageModel = ReturnType<typeof transformersJS> & {
	availability: () => Promise<"unavailable" | "downloadable" | "available">;
	createSessionWithProgress: (
		onProgress?: (progress: { progress: number }) => void,
	) => Promise<unknown>;
};

let initPromise: Promise<DownloadableLanguageModel> | null = null;
let cachedModel: DownloadableLanguageModel | null = null;

export function getSmolLM3Model(): DownloadableLanguageModel {
	if (!cachedModel) {
		cachedModel = transformersJS(MODEL_ID, {
			device: "webgpu",
			dtype: "q4f16", // use quantized weights to reduce download size/memory
		}) as DownloadableLanguageModel;
	}
	return cachedModel;
}

type EnsureOptions = {
	onProgress?: (p: { progress: number }) => void;
};

/**
 * Ensure the Mistral model is initialized (and downloaded if needed).
 * Reuses a shared in-flight promise so concurrent callers don't double-download.
 */
export async function ensureSmolLM3ModelReady(options: EnsureOptions = {}) {
	if (initPromise) return initPromise;

	const model = getSmolLM3Model();
	initPromise = (async () => {
		const availability = await model.availability();
		if (availability === "unavailable") {
			throw new Error("SmolLM3 model unavailable in this environment");
		}
		if (availability === "downloadable") {
			await model.createSessionWithProgress(options.onProgress);
		}
		return model;
	})();

	try {
		return await initPromise;
	} catch (err) {
		initPromise = null; // allow retry after a failure
		throw err;
	}
}

/**
 * Best-effort check: has the model been marked ready previously?
 * Returns false server-side or if the flag is missing.
 */
export function isSmolLM3ModelReadyFlag(): boolean {
	if (typeof window === "undefined" || typeof localStorage === "undefined")
		return false;
	return localStorage.getItem(LOCAL_READY_KEY) === "true";
}

/**
 * Clear cached weights and our singleton so a fresh download can occur.
 */
export async function clearSmolLM3Cache() {
	await cleanClearCahce(MODEL_ID, LOCAL_READY_KEY);

	initPromise = null;
	cachedModel = null;
}

/**
 * Lightweight cache check for UX gating; returns false on SSR.
 */
export async function hasCachedSmolLM3Weights(): Promise<boolean> {
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
