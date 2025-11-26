import { TransformersJSSpeechModel } from "@built-in-ai/transformers-js";
import { TransformersJSDownloadCard } from "./TransformersJSDownloadCard";
import { env } from "@huggingface/transformers";
import {
  MODEL_ID,
  LOCAL_READY_KEY,
  getSpeechModel,
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
          label: "Hugging Face",
        },
      ]}
      clearCacheDescription="This will remove the model files from your browser cache. You will need to download them again to use the model."
      onDownload={async ({ onProgress }) => {
        const model = getSpeechModel() as unknown as TransformersJSSpeechModel;
        await model.createSessionWithProgress((p) => {
          onProgress(p.progress);
        });
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(LOCAL_READY_KEY, "true");
        }
      }}
      clearCache={clearSpeechCache}
      hasCached={hasCachedSpeechWeights}
      isReadyFlag={isSpeechModelReadyFlag}
      getAvailability={async () => {
        const model = getSpeechModel() as unknown as TransformersJSSpeechModel;
        return await model.availability();
      }}
    />
  );
}
