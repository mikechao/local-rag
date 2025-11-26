import {
  pipeline,
  type Pipeline,
  type ProgressInfo,
} from "@huggingface/transformers";

export function initTransformersJSSpeechWorker() {
  let pipelineInstance: Pipeline | null = null;

  self.addEventListener("message", async (event: MessageEvent) => {
    const { type, data } = event.data;

    if (type === "load") {
      try {
        const { modelId, device, dtype, quantized, revision } = data;

        // @ts-ignore - pipeline options
        pipelineInstance = (await pipeline("text-to-speech", modelId, {
          device,
          dtype,
          quantized,
          revision,
          progress_callback: (progress: ProgressInfo) => {
            self.postMessage(progress);
          },
        } as any)) as Pipeline;

        self.postMessage({ status: "ready" });
      } catch (error) {
        self.postMessage({
          status: "error",
          data: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (type === "generate") {
      if (!pipelineInstance) {
        self.postMessage({
          status: "error",
          data: "Model not initialized",
        });
        return;
      }

      try {
        const { text, speaker_embeddings, speaker_id, speed } = data;

        // @ts-ignore
        const output = await pipelineInstance(text, {
          speaker_embeddings,
          speaker_id,
          speed,
        });

        // output is { audio: Float32Array, sampling_rate: number }
        self.postMessage(
          {
            status: "complete",
            output: {
              audio: output.audio,
              sampling_rate: output.sampling_rate,
            },
          },
          // @ts-ignore - transfer list
          [output.audio.buffer],
        );
      } catch (error) {
        self.postMessage({
          status: "error",
          data: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}
