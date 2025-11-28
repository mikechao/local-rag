export async function cleanClearCahce(modelId: string, localReadyKey: string) {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.removeItem(localReadyKey);
  }

  if (typeof window !== "undefined" && typeof caches !== "undefined") {
    const cache = await caches.open('transformers-cache');
    const entries = await cache.keys();
    for (const req of entries) {
      if (req.url.includes(modelId)) {
        await cache.delete(req, { ignoreSearch: true });
      }
    }
  }
}