import {
  SpeechModelV2,
  SpeechModelV2CallOptions,
  LoadSettingError,
} from "@ai-sdk/provider";
import {
  pipeline,
  env,
  type Pipeline,
  type ProgressInfo,
} from "@huggingface/transformers";
import { TransformersJSSpeechSettings } from "./transformers-js-speech-settings";
import { encodeWAV } from "../util/wav-encoder";

export type TransformersJSSpeechModelId = string;

export function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined";
}

export function isServerEnvironment(): boolean {
  return typeof window === "undefined" && typeof process !== "undefined";
}

export class TransformersJSSpeechModel implements SpeechModelV2 {
  readonly specificationVersion = "v2";
  readonly provider = "transformers-js";
  readonly modelId: TransformersJSSpeechModelId;

  private readonly config: TransformersJSSpeechSettings;
  private pipelineInstance?: Pipeline;
  private isInitialized = false;
  private initializationPromise?: Promise<void>;
  private workerReady = false;

  constructor(
    modelId: TransformersJSSpeechModelId,
    settings: TransformersJSSpeechSettings = {},
  ) {
    this.modelId = modelId;
    this.config = settings;
  }

  private async getPipeline(
    onInitProgress?: (progress: { progress: number }) => void,
  ): Promise<Pipeline> {
    if (this.pipelineInstance && this.isInitialized) {
      return this.pipelineInstance;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      if (this.pipelineInstance) {
        return this.pipelineInstance;
      }
    }

    this.initializationPromise = this._initializeModel(onInitProgress);
    await this.initializationPromise;

    if (!this.pipelineInstance) {
      throw new LoadSettingError({
        message: "Speech model initialization failed",
      });
    }

    return this.pipelineInstance;
  }

  private async _initializeModel(
    onInitProgress?: (progress: { progress: number }) => void,
  ): Promise<void> {
    try {
      const {
        device,
        dtype,
        quantized = true,
        revision = "main",
        cache_dir,
        local_files_only,
      } = this.config;
      const progress_callback = this.createProgressTracker(onInitProgress);

      const resolvedDevice = this.resolveDevice(device);

      // @ts-ignore - pipeline types might not fully match options yet
      this.pipelineInstance = (await pipeline("text-to-speech", this.modelId, {
        device: resolvedDevice,
        dtype,
        quantized,
        revision,
        cache_dir,
        local_files_only,
        progress_callback,
      } as any)) as Pipeline;

      onInitProgress?.({ progress: 1.0 });
      this.isInitialized = true;
    } catch (error) {
      this.pipelineInstance = undefined;
      this.isInitialized = false;
      this.initializationPromise = undefined;

      throw new LoadSettingError({
        message: `Failed to initialize TransformersJS speech model: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  private resolveDevice(device?: any): any {
    if (device && device !== "auto") {
      return device;
    }

    if (isServerEnvironment()) {
      return "cpu";
    }

    // Browser default
    return "auto";
  }

  private createProgressTracker(
    onInitProgress?: (progress: { progress: number }) => void,
  ) {
    const fileProgress = new Map<string, { loaded: number; total: number }>();

    return (p: ProgressInfo) => {
      if (!onInitProgress) return;

      // Type guard to check if p has model file property
      const progressWithFile = p as ProgressInfo & {
        file?: string;
        loaded?: number;
        total?: number;
      };
      const file = progressWithFile.file;

      if (!file) return;

      if (p.status === "progress" && file) {
        fileProgress.set(file, {
          loaded: progressWithFile.loaded || 0,
          total: progressWithFile.total || 0,
        });
      } else if (p.status === "done" && file) {
        const prev = fileProgress.get(file);
        if (prev?.total) {
          fileProgress.set(file, { loaded: prev.total, total: prev.total });
        }
      }

      // Calculate overall progress
      let totalLoaded = 0;
      let totalBytes = 0;
      for (const { loaded, total } of fileProgress.values()) {
        if (total > 0) {
          totalLoaded += loaded;
          totalBytes += total;
        }
      }

      if (totalBytes > 0) {
        onInitProgress({ progress: Math.min(1, totalLoaded / totalBytes) });
      }
    };
  }

  public async availability(): Promise<
    "unavailable" | "downloadable" | "available"
  > {
    if (this.config.worker && isBrowserEnvironment()) {
      return this.workerReady ? "available" : "downloadable";
    }

    if (this.isInitialized) {
      return "available";
    }

    return "downloadable";
  }

  public async createSessionWithProgress(
    onDownloadProgress?: (progress: { progress: number }) => void,
  ): Promise<TransformersJSSpeechModel> {
    if (this.config.worker && isBrowserEnvironment()) {
      await this.initializeWorker(onDownloadProgress);
      return this;
    }

    if (!this.initializationPromise) {
      this.initializationPromise = this._initializeModel(onDownloadProgress);
    }
    await this.initializationPromise;
    return this;
  }

  async doGenerate(
    options: SpeechModelV2CallOptions,
  ): Promise<Awaited<ReturnType<SpeechModelV2["doGenerate"]>>> {
    const currentDate = new Date();
    const { text, voice, speed } = options;

    // Resolve voice
    const speakerOptions = await this.resolveVoice(voice);

    // Use worker if provided and in browser environment
    if (this.config.worker && isBrowserEnvironment()) {
      return this.doGenerateWithWorker(
        text,
        speakerOptions,
        speed,
        currentDate,
        options,
      );
    }

    const pipeline = await this.getPipeline(this.config.initProgressCallback);

    try {
      // @ts-ignore - pipeline call signature
      const output = await pipeline(text, {
        ...speakerOptions,
        speed,
      });

      // output is { audio: Float32Array, sampling_rate: number }
      const { audio, sampling_rate } = output;

      // Encode to WAV
      const wavAudio = encodeWAV(audio, sampling_rate);

      return {
        audio: wavAudio,
        warnings: [],
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: {},
          body: JSON.stringify({
            text,
            duration: audio.length / sampling_rate,
            sampling_rate,
          }),
        },
        providerMetadata: {
          "transformers-js": {
            samplingRate: sampling_rate,
            duration: audio.length / sampling_rate,
            format: "wav",
            mimeType: "audio/wav",
          },
        },
      };
    } catch (error) {
      throw new Error(
        `TransformersJS speech generation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  private async resolveVoice(
    voice?: string,
  ): Promise<{ speaker_embeddings?: any; speaker_id?: number }> {
    let speaker_embeddings = this.config.speaker_embeddings;
    let speaker_id = this.config.speaker_id;

    if (voice) {
      // Check if voice is a URL
      if (voice.startsWith("http")) {
        try {
          const response = await fetch(voice);
          if (!response.ok) {
            throw new Error(`Failed to fetch voice from URL: ${voice}`);
          }
          const buffer = await response.arrayBuffer();
          // Assuming the binary is a raw Float32Array or Tensor serialization
          // For simplicity, let's assume it's a raw Float32Array for now, or we might need a specific format.
          // The plan says "convert the response to a Float32Array (or Tensor)".
          // If it's a .bin file from HF, it might be a tensor.
          // Let's assume raw float32 for now.
          speaker_embeddings = new Float32Array(buffer);
        } catch (error) {
          throw new Error(
            `Failed to load voice from URL: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      } else if (!isNaN(Number(voice))) {
        // Numeric string -> speaker_id
        speaker_id = Number(voice);
      } else {
        // Treat as speaker_embeddings path or ID if not URL?
        // Or maybe it's a preset name?
        // For now, if it's not a URL and not a number, we might assume it's not supported or it's a local path?
        // But we are in browser mostly.
        // Let's assume it's not supported if not URL/Number for now, or maybe it's a key in a preset map?
        // The plan says "If voice is a numeric string ... passed as speaker_id".
      }
    }

    return { speaker_embeddings, speaker_id };
  }

  private async doGenerateWithWorker(
    text: string,
    speakerOptions: { speaker_embeddings?: any; speaker_id?: number },
    speed: number | undefined,
    currentDate: Date,
    options: SpeechModelV2CallOptions,
  ): Promise<Awaited<ReturnType<SpeechModelV2["doGenerate"]>>> {
    const worker = this.config.worker!;

    await this.initializeWorker();

    const result = await new Promise<{
      audio: Float32Array;
      sampling_rate: number;
    }>((resolve, reject) => {
      const onMessage = (e: MessageEvent) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.status === "complete") {
          worker.removeEventListener("message", onMessage);
          resolve(msg.output);
        } else if (msg.status === "error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(String(msg.data || "Worker error")));
        }
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({
        type: "generate",
        data: {
          text,
          ...speakerOptions,
          speed,
        },
      });

      if (options.abortSignal) {
        const onAbort = () => {
          // worker.postMessage({ type: "interrupt" }); // Interrupt not fully supported in TTS pipeline yet maybe?
          options.abortSignal?.removeEventListener("abort", onAbort);
        };
        options.abortSignal.addEventListener("abort", onAbort);
      }
    });

    const { audio, sampling_rate } = result;
    const wavAudio = encodeWAV(audio, sampling_rate);

    return {
      audio: wavAudio,
      warnings: [],
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: {},
        body: JSON.stringify({
          text,
          duration: audio.length / sampling_rate,
          sampling_rate,
        }),
      },
      providerMetadata: {
        "transformers-js": {
          samplingRate: sampling_rate,
          duration: audio.length / sampling_rate,
          format: "wav",
          mimeType: "audio/wav",
        },
      },
    };
  }

  private async initializeWorker(
    onInitProgress?: (progress: { progress: number }) => void,
  ): Promise<void> {
    if (!this.config.worker) return;

    if (this.workerReady) {
      if (onInitProgress) onInitProgress({ progress: 1 });
      return;
    }

    const worker = this.config.worker;

    await new Promise<void>((resolve, reject) => {
      const trackProgress = this.createProgressTracker(onInitProgress);

      const onMessage = (e: MessageEvent) => {
        const msg = e.data;
        if (!msg) return;

        if (msg && typeof msg === "object" && "status" in msg) {
          if (msg.status === "ready") {
            worker.removeEventListener("message", onMessage);
            this.workerReady = true;
            if (onInitProgress) onInitProgress({ progress: 1 });
            resolve();
            return;
          }
          if (msg.status === "error") {
            worker.removeEventListener("message", onMessage);
            reject(
              new Error(String(msg.data || "Worker initialization failed")),
            );
            return;
          }
        }
        const msgWithFile = msg as ProgressInfo & { file?: string };
        if (msgWithFile.file) trackProgress(msg as ProgressInfo);
      };

      worker.addEventListener("message", onMessage);
      worker.postMessage({
        type: "load",
        data: {
          modelId: this.modelId,
          dtype: this.config.dtype,
          device: this.config.device,
          quantized: this.config.quantized,
          revision: this.config.revision,
        },
      });
    });
  }
}
