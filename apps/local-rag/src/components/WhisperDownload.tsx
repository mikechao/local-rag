import { transformersJS, TransformersJSTranscriptionModel } from "@built-in-ai/transformers-js";
import { TransformersJSDownloadCard } from "@/components/model-download/TransformersJSDownloadCard";
import { env } from "@huggingface/transformers";

// Configure local environment for transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

export function WhisperDownload() {
  const modelId = "Xenova/whisper-base";

  const getModel = () => {
    return transformersJS.transcription(modelId) as unknown as TransformersJSTranscriptionModel;
  };

  return (
    <TransformersJSDownloadCard
      title="Whisper Base"
      modelId={modelId}
      descriptionPrefix="Download"
      descriptionSuffix="for automatic speech recognition (ASR) directly in your browser."
      links={[
        {
          href: "https://huggingface.co/Xenova/whisper-base",
          label: "Hugging Face",
        },
      ]}
      clearCacheDescription="This will remove the model files from your browser cache. You will need to download them again to use the model."
      onDownload={async ({ onProgress }) => {
        const model = getModel();
        await model.createSessionWithProgress((p) => {
          onProgress(p.progress);
        });
      }}
      clearCache={async () => {
        // Transformers.js cache clearing is usually handled by the browser cache API
        // or specific library methods if available. 
        // For now, we might not have a direct way to clear just this model via the wrapper
        // unless we expose it. 
        // But TransformersJSDownloadCard expects this prop.
        // We can try to clear the cache storage if we know the cache name.
        if ('caches' in window) {
            try {
                await caches.delete('transformers-cache');
            } catch (e) {
                console.error("Failed to clear cache", e);
            }
        }
      }}
      hasCached={async () => {
        const model = getModel();
        const availability = await model.availability();
        return availability === "available";
      }}
      isReadyFlag={() => {
        // We don't have a synchronous flag easily accessible without checking availability async
        // But we can try to check if we have an initialized instance if we store it in context/state
        // For now, return false and rely on async check
        return false;
      }}
      getAvailability={async () => {
        const model = getModel();
        return await model.availability();
      }}
    />
  );
}
