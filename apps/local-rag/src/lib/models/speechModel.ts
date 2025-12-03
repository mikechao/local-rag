import {
  pipeline,
  env,
  type TextToAudioPipeline,
  RawAudio,
  type RawAudio as RawAudioType,
} from "@huggingface/transformers";
import { split, TextSplitterStream } from "../splitter";
import { cleanClearCahce } from "./utils";

export const MODEL_ID = "onnx-community/Supertonic-TTS-ONNX";
export const LOCAL_READY_KEY = "supertonic-tts-ready";
const VOICES_URL = `/voices/`;

// Configure local environment
env.allowLocalModels = false;
env.useBrowserCache = true;

let pipelinePromise: Promise<TextToAudioPipeline> | null = null;
let embeddingsPromise: Promise<Record<string, Float32Array>> | null = null;

export async function loadSpeechPipeline(
  progressCallback?: (info: any) => void,
) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      // @ts-ignore
      const tts = (await pipeline("text-to-speech", MODEL_ID, {
        device: "webgpu",
        progress_callback: progressCallback,
      })) as TextToAudioPipeline;
      // Warm up the model to compile shaders
      await tts("Hello", {
        speaker_embeddings: new Float32Array(1 * 101 * 128), // Dummy embedding
        num_inference_steps: 1,
        speed: 1.0,
      });
      console.log('after warmup');
      return tts;
    })();
  }
  return pipelinePromise;
}

export async function loadSpeakerEmbeddings() {
  if (!embeddingsPromise) {
    embeddingsPromise = (async () => {
      const [female, male] = await Promise.all([
        fetch(`${VOICES_URL}F1.bin`).then((r) => r.arrayBuffer()),
        fetch(`${VOICES_URL}M1.bin`).then((r) => r.arrayBuffer()),
      ]);
      return {
        Female: new Float32Array(female),
        Male: new Float32Array(male),
      };
    })();
  }
  return embeddingsPromise;
}

function splitWithConstraints(
  text: string,
  { minCharacters = 1, maxCharacters = Infinity } = {},
): string[] {
  if (!text) return [];
  const rawLines = split(text);
  const result: string[] = [];
  let currentBuffer = "";

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.length > maxCharacters) {
      throw new Error(
        `A single segment exceeds the maximum character limit of ${maxCharacters} characters.`,
      );
    }

    if (currentBuffer) currentBuffer += " ";
    currentBuffer += line;

    while (currentBuffer.length > maxCharacters) {
      result.push(currentBuffer.slice(0, maxCharacters));
      currentBuffer = currentBuffer.slice(maxCharacters);
    }
    if (currentBuffer.length >= minCharacters) {
      result.push(currentBuffer);
      currentBuffer = "";
    }
  }
  if (currentBuffer) result.push(currentBuffer);
  return result;
}

export async function generateSpeech(text: string, voice: "Female" | "Male" = "Female") {
  const [tts, embeddings] = await Promise.all([
    loadSpeechPipeline(),
    loadSpeakerEmbeddings(),
  ]);

  const speaker_embeddings = embeddings[voice];
  const chunks = splitWithConstraints(text, {
    minCharacters: 100,
    maxCharacters: 1000,
  });

  if (chunks.length === 0) chunks.push(text);

  const audioChunks: Float32Array[] = [];
  let sampling_rate = 24000; // Default, will be updated from output

  for (let i = 0; i < chunks.length; ++i) {
    const chunk = chunks[i];
    if (!chunk.trim()) continue;

    const output = (await tts(chunk, {
      speaker_embeddings,
      num_inference_steps: 5,
      speed: 1.05
    })) as RawAudioType;
    
    sampling_rate = output.sampling_rate;

    // No added silence; speed responsiveness
    audioChunks.push(output.audio);
  }

  const merged = new Float32Array(
    audioChunks.reduce((acc, chunk) => acc + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const mergedAudio = new RawAudio(merged, sampling_rate);
  return mergedAudio.toBlob();
}

export async function* generateSpeechStream(
  textStream: AsyncIterable<string>,
  voice: "Female" | "Male" = "Female",
): AsyncGenerator<{ audio: Float32Array; sampling_rate: number }> {
  const [tts, embeddings] = await Promise.all([
    loadSpeechPipeline(),
    loadSpeakerEmbeddings(),
  ]);

  const speaker_embeddings = embeddings[voice];
  const splitter = new TextSplitterStream();

  // Process text stream in background
  const processText = async () => {
    for await (const chunk of textStream) {
      splitter.push(chunk);
    }
    splitter.close();
  };
  const textProcessing = processText();

  for await (const sentence of splitter) {
    // Skip empty or punctuation-only sentences to avoid WebGPU errors
    if (!sentence.trim() || !/[a-zA-Z0-9]/.test(sentence)) continue;

    const output = (await tts(sentence, {
      speaker_embeddings,
      num_inference_steps: 5,
      speed: 1.05
    })) as RawAudio;

    yield {
      audio: output.audio,
      sampling_rate: output.sampling_rate,
    };
  }

  await textProcessing;
}

export class TextStream implements AsyncIterable<string> {
  private queue: string[] = [];
  private resolvers: ((value: IteratorResult<string>) => void)[] = [];
  private finished = false;

  push(text: string) {
    if (this.finished) return;
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: text, done: false });
    } else {
      this.queue.push(text);
    }
  }

  close() {
    this.finished = true;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: () => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.finished) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

export async function hasCachedSpeechWeights(): Promise<boolean> {
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

export function isSpeechModelReadyFlag(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined")
    return false;
  return localStorage.getItem(LOCAL_READY_KEY) === "true";
}

export async function clearSpeechCache() {
  await cleanClearCahce(MODEL_ID, LOCAL_READY_KEY);
}
