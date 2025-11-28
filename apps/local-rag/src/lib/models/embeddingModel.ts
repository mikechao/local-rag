import { transformersJS } from "@built-in-ai/transformers-js";

// Centralized model config so UI and routes stay in sync.
export const MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
export const MODEL_DEVICE: "auto" | "cpu" | "webgpu" = "auto";
export const LOCAL_READY_KEY = "embeddinggemma-onnx-ready";

type DownloadableEmbeddingModel = ReturnType<
	typeof transformersJS.textEmbedding
> & {
	availability: () => Promise<"unavailable" | "downloadable" | "available">;
	createSessionWithProgress: (
		onProgress?: (progress: { progress: number }) => void,
	) => Promise<unknown>;
};

let modelSingleton: DownloadableEmbeddingModel | null = null;
let initPromise: Promise<DownloadableEmbeddingModel> | null = null;

export function getModel(): DownloadableEmbeddingModel {
	if (!modelSingleton) {
		modelSingleton = transformersJS.textEmbedding(MODEL_ID, {
			device: "webgpu",
		}) as DownloadableEmbeddingModel;
	}
	return modelSingleton;
}

type EnsureOptions = {
	onProgress?: (p: { progress: number }) => void;
};

/**
 * Ensure the embedding model is initialized (and downloaded if needed).
 * Reuses a shared in-flight promise so concurrent callers don't double-download.
 */
export async function ensureEmbeddingModelReady(options: EnsureOptions = {}) {
	if (initPromise) return initPromise;

	const model = getModel();
	initPromise = (async () => {
		const availability = await model.availability();
		if (availability === "unavailable") {
			throw new Error("Embedding model unavailable in this environment");
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
export function isModelReadyFlag(): boolean {
	if (typeof window === "undefined" || typeof localStorage === "undefined")
		return false;
	return localStorage.getItem(LOCAL_READY_KEY) === "true";
}

/**
 * Clear cached weights and our singleton so a fresh download can occur.
 */
export async function clearEmbeddingCache() {
	if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
		localStorage.removeItem(LOCAL_READY_KEY);
	}
	if (typeof window !== "undefined" && typeof caches !== "undefined") {
		const cache = await caches.open('transformers-cache');
		const entries = await cache.keys();
		for (const req of entries) {
			if (req.url.includes(MODEL_ID)) {
				await cache.delete(req, { ignoreSearch: true });
			}
		}
	}

	modelSingleton = null;
	initPromise = null;
}

/**
 * Lightweight cache check for UX gating; returns false on SSR.
 */
export async function hasCachedWeights(): Promise<boolean> {
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
