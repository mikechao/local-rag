import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";
import { env } from "@huggingface/transformers";
import {
  MODEL_ID,
  LOCAL_READY_KEY,
  loadSpeechPipeline,
  hasCachedSpeechWeights,
  isSpeechModelReadyFlag,
  clearSpeechCache,
} from "@/lib/models/speechModel";

// Configure local environment for transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

export function SpeechDownload() {
  return (
    <TransformersJSDownloadCard
      title="Supertonic TTS"
      modelId={MODEL_ID}
      descriptionPrefix="Download"
      descriptionSuffix="for text-to-speech generation directly in your browser."
      links={[
        {
          href: "https://huggingface.co/onnx-community/Supertonic-TTS-ONNX",
          label: "View on Hugging Face",
        },
      ]}
      clearCacheDescription="This will remove the model files from your browser cache. You will need to download them again to use the model."
      onDownload={async ({ onProgress }) => {
        await loadSpeechPipeline((p) => {
          if (p.status === "progress") {
            // Normalize to a 0-1 fraction for the UI
            // it downloads multiple files
            const fraction = p.progress > 1 ? p.progress / 100 : p.progress;
            onProgress(Math.min(1, fraction));
          }
        });
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(LOCAL_READY_KEY, "true");
        }
      }}
      clearCache={clearSpeechCache}
      hasCached={hasCachedSpeechWeights}
      isReadyFlag={isSpeechModelReadyFlag}
      getAvailability={async () => {
        if (isSpeechModelReadyFlag()) return "available";
        if (await hasCachedSpeechWeights()) return "downloadable";
        return "downloadable";
      }}
    />
  );
}
