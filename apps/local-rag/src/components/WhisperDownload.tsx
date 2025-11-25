import { TransformersJSTranscriptionModel } from "@built-in-ai/transformers-js";
import { TransformersJSDownloadCard } from "@/components/model-download/TransformersJSDownloadCard";
import { env } from "@huggingface/transformers";
import {
  MODEL_ID,
  LOCAL_READY_KEY,
  getWhisperModel,
  hasCachedWhisperWeights,
  isWhisperModelReadyFlag,
  clearWhisperCache,
} from "@/lib/models/whisperModel";

// Configure local environment for transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

export function WhisperDownload() {
  return (
    <TransformersJSDownloadCard
      title="Whisper Base"
      modelId={MODEL_ID}
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
        const model = getWhisperModel() as unknown as TransformersJSTranscriptionModel;
        await model.createSessionWithProgress((p) => {
          onProgress(p.progress);
        });
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(LOCAL_READY_KEY, "true");
        }
      }}
      clearCache={clearWhisperCache}
      hasCached={hasCachedWhisperWeights}
      isReadyFlag={isWhisperModelReadyFlag}
      getAvailability={async () => {
        const model = getWhisperModel() as unknown as TransformersJSTranscriptionModel;
        return await model.availability();
      }}
    />
  );
}
