# Plan: TransformersJS Speech Model

This document outlines the plan to implement a `TransformersJSSpeechModel` for the `@built-in-ai/transformers-js` package, enabling text-to-speech capabilities using `@huggingface/transformers`.

## 1. Overview

We will create a new class `TransformersJSSpeechModel` that implements the `SpeechModelV2` interface from `@ai-sdk/provider`. This model will utilize the `pipeline` function from `@huggingface/transformers` to generate speech from text.

## 2. File Structure

New files to be created:
- `packages/built-in-ai/packages/transformers-js/src/speech/transformers-js-speech-model.ts`: Main model implementation.
- `packages/built-in-ai/packages/transformers-js/src/speech/transformers-js-speech-settings.ts`: Settings interface definition (optional, can be in model file).

## 3. Class Design

### `TransformersJSSpeechModel`

**Implements**: `SpeechModelV2`

**Properties**:
- `specificationVersion`: 'v2'
- `provider`: 'transformers-js'
- `modelId`: string
- `config`: `TransformersJSSpeechSettings`

**Methods**:
- `constructor(modelId: string, settings: TransformersJSSpeechSettings)`
- `doGenerate(options: SpeechModelV2CallOptions): Promise<SpeechModelResponse>`
- `availability(): Promise<"unavailable" | "downloadable" | "available">`
- `createSessionWithProgress(callback): Promise<TransformersJSSpeechModel>`

### `TransformersJSSpeechSettings`

Extends `PretrainedModelOptions` (device, dtype).

**Fields**:
- `initProgressCallback`: Callback for initialization progress.
- `worker`: Optional `Worker` instance for off-thread execution.
- `speaker_embeddings`: Default speaker embeddings (voice).
- `speaker_id`: Default speaker ID (for multi-speaker models).
- `quantized`: Boolean to use quantized models (default: true).
- `revision`: Model revision (default: 'main').
- `cache_dir`: Custom cache directory (Node.js only).
- `local_files_only`: Boolean to force using local files.

## 4. Implementation Details

### Pipeline Configuration & Environment
- **Environment Detection**: We will use `isBrowserEnvironment()` and `isServerEnvironment()` helpers.
- **Device Resolution**:
    - Node.js: Default to `'cpu'` unless configured otherwise.
    - Browser: Default to `'auto'` (which prefers `'webgpu'` if available). Users can also explicitly set `'webgpu'`, `'wasm'`, or `'cpu'`.
- **Global Configuration**:
    - We will allow configuring `env.allowLocalModels` and `env.useBrowserCache` via a static setup method or global config if needed, but primarily rely on `transformers.js` defaults.
- **Pipeline Options**:
    - The `pipeline` function will be called with:
        ```typescript
        pipeline('text-to-speech', modelId, {
            device: resolvedDevice,
            dtype: resolvedDtype,
            quantized: config.quantized,
            revision: config.revision,
            cache_dir: config.cache_dir,
            local_files_only: config.local_files_only,
            progress_callback: progressTracker
        })
        ```

### Initialization
- The model will lazily initialize the `text-to-speech` pipeline upon the first call to `doGenerate` or explicit `createSessionWithProgress`.
- **Progress Tracking**: We will implement a `createProgressTracker` method (similar to the transcription model) to hook into `transformers.js`'s `progress_callback`. This will:
    - Track individual file downloads (weights, config, tokenizer, etc.).
    - Aggregate progress across all files to provide a unified 0-1 progress value.
    - Support `initProgressCallback` from settings.
- **Caching**:
    - The initialized `pipeline` instance will be cached in a private property (`this.pipelineInstance`) to ensure the model is only loaded once per instance.
    - Subsequent calls will reuse the cached pipeline.
    - `transformers.js` automatically handles caching of model files (weights/configs) in the browser Cache API or local filesystem.
- **Worker State**:
    - If using a worker, `this.workerReady` tracks whether the worker has successfully loaded the model.
    - It is set to `true` upon receiving the `status: 'ready'` message from the worker.
    - It is reset to `false` if the worker sends a `status: 'error'` during initialization or if the worker is terminated.

### Availability Logic
We will implement `availability()` to reflect the model's readiness state, mirroring the transcription model:
1.  **Worker Mode (Browser)**:
    -   If `this.workerReady` is true: return `'available'`.
    -   Otherwise: return `'downloadable'` (implying it can be loaded).
2.  **Main Thread / Server**:
    -   If `this.isInitialized` is true: return `'available'`.
    -   Otherwise: return `'downloadable'`.
3.  **Unavailable**:
    -   We currently do not have a mechanism to pre-check if a model is strictly "unavailable" (e.g., offline and not cached) without attempting to load it. Thus, we default to `'downloadable'` for uninitialized states.
    -   **Future Improvement**: We could potentially check `navigator.onLine` in the browser, but that is not a guarantee of model availability (cache vs network). For now, we stick to the simple state check.

### Voice & Speaker Handling
The `voice` parameter in `generateSpeech` is a string. We need a robust strategy to map this to what `transformers.js` pipelines expect (`speaker_embeddings` or `speaker_id`).

1.  **Voice Resolution Strategy**:
    - **URL**: If `voice` is a URL (e.g., `https://.../embedding.bin`), we will fetch it and convert the response to a `Float32Array` (or `Tensor`) to be passed as `speaker_embeddings`.
    - **Speaker ID**: If `voice` is a numeric string (e.g., "0", "1"), it will be passed as `speaker_id` (integer) for multi-speaker models (like VITS/MMS).
2.  **Defaults**:
    - If `voice` is undefined, check `config.speaker_embeddings` or `config.speaker_id`.
    - If no voice is provided and the model requires one (e.g., SpeechT5), throw a descriptive error.
3.  **Validation**:
    - Validate that fetched embeddings are valid binary data.
    - Catch and rethrow fetch errors with context.

### Feature Support & Validation
- **Speed**:
    - The `speed` parameter from `generateSpeech` will be passed directly to the pipeline.
    - **Range**: We will not enforce strict validation in the wrapper, allowing the underlying model to handle it. However, we will document that typical values range from 0.5 to 2.0.
- **Language**:
    - The `language` parameter will be passed to the pipeline options.
    - This is critical for multilingual models (e.g., MMS, VITS).
    - If the model does not support the requested language, `transformers.js` will likely throw an error, which we will catch and wrap.
- **SSML / Markup**:
    - **Not Supported**: Standard `transformers.js` text-to-speech models expect plain text.
    - Any SSML tags provided in the `text` input will be passed as-is to the model, which will likely attempt to pronounce them. We will not implement an SSML stripper or parser in this version.
- **Streaming**:
    - **Not Supported**: This implementation generates the full audio file at once. Streaming or partial audio chunks are intentionally unsupported in this version.

### `doGenerate` Method
- **Inputs**: `text`, `voice`, `speed`, `language`.
- **Process**:
  1.  **Resolve Voice**: Apply the Voice Resolution Strategy to determine `speaker_embeddings` or `speaker_id`.
  2.  Check if running in browser or server.
  3.  If `worker` is provided and in browser, delegate to `doGenerateWithWorker`.
  4.  Otherwise, run on main thread/server using `pipeline`.
  5.  Call `pipeline('text-to-speech', modelId, { ... })`.
  6.  Pass `text` as input.
  7.  Pass resolved `speaker_embeddings` or `speaker_id`, `speed`, and `language`.
- **Output Processing**:
  - The pipeline returns an object containing `audio` (Float32Array) and `sampling_rate`.
  - **Crucial Step**: Convert the raw Float32Array and sampling rate into a WAV file buffer (Uint8Array). `SpeechModelV2` expects a binary format that can be detected (like WAV).
  - We will need a helper utility to write a WAV header and PCM data.
  - **Response Construction**: The `doGenerate` method will return an object satisfying the `SpeechModelV2` contract:
    - `audio`: The encoded WAV data (`Uint8Array`).
    - `warnings`: Array of any warnings encountered (e.g., unsupported options).
    - `response`: Standard response metadata.
        - `timestamp`: Current time.
        - `modelId`: The model ID.
        - `headers`: Empty (local execution).
        - `body`: JSON string containing metadata (text, duration, sampling_rate).
    - `providerMetadata`:
        - `transformers-js`:
            - `samplingRate`: The sampling rate returned by the pipeline.
            - `duration`: Calculated duration in seconds (`samples.length / (samplingRate * channels)`).
            - `format`: 'wav'.
            - `mimeType`: 'audio/wav'.

### Worker Support
- Similar to `TransformersJSTranscriptionModel`, we will support running the model in a Web Worker.
- **Protocol**:
  - `type: 'load'`: Initialize the pipeline.
  - `type: 'generate'`: Generate speech.
- The worker implementation (user-side) will need to use `pipeline` and handle these messages. The `TransformersJSSpeechModel` will act as the client.

### Worker Implementation Details
To facilitate easy worker creation, we will provide a helper class/handler similar to `transformers-js-transcription-worker-handler.ts`.

1.  **Message Schema**:
    - **Input (`SpeechWorkerMessage`)**:
        - `type: 'load'`: Payload `{ modelId, dtype, device, quantized, revision }`.
        - `type: 'generate'`: Payload `{ text, voice, speed, language }`.
    - **Output (`SpeechWorkerResponse`)**:
        - `status: 'ready'`: Model loaded.
        - `status: 'complete'`: Generation finished. Payload `{ audio: Float32Array, sampling_rate: number }`.
        - `status: 'error'`: Payload `{ data: string }` (error message).
        - `status: 'progress'`: Download progress (forwarded from `transformers.js`).
2.  **Transferables**:
    - When sending the generated audio back to the main thread, the `Float32Array` buffer will be added to the transfer list to avoid copying large data.
    - **Encoding Location**: The worker returns raw `Float32Array` samples. The **main thread** (inside `TransformersJSSpeechModel`) is responsible for encoding these samples into WAV format using the `encodeWAV` utility. This keeps the worker lightweight and focused on generation.
3.  **Worker Code Location**:
    - We will create `packages/built-in-ai/packages/transformers-js/src/speech/transformers-js-speech-worker-handler.ts`.
    - This file will export a `SpeechModelManager` class (or similar) that users can import in their worker file (e.g., `worker.ts`) to handle the message loop.
    - **User's Worker File**:
        ```typescript
        import { SpeechModelManager } from '@built-in-ai/transformers-js/speech-worker';
        
        self.addEventListener('message', async (e) => {
            const { type, data } = e.data;
            // ... delegate to manager ...
        });
        ```
    - **Export Path**: We will ensure `package.json` exports `./speech-worker` pointing to `dist/speech/transformers-js-speech-worker-handler.js` (or similar) to match the import example.

### Concurrency & Reuse
We will follow the pattern established in `TransformersJSTranscriptionModel`:

1.  **Pipeline Reuse**:
    - The `pipeline` instance is created once and stored in `this.pipelineInstance`.
    - It is reused for all subsequent calls to `doGenerate`.
    - There is no explicit teardown mechanism planned (consistent with other models in this package), as the model instance is typically long-lived.
2.  **Concurrency**:
    - `transformers.js` pipelines are generally not thread-safe for concurrent execution on the same instance if they maintain internal state during generation.
    - However, since `doGenerate` is `async`, multiple calls can be awaited.
    - **Policy**: We will allow concurrent calls. If the underlying `transformers.js` pipeline implementation queues requests internally (which it typically does for async execution), we rely on that. If strict serialization is required for specific models, we will document that, but the default implementation will not enforce a mutex lock, mirroring the transcription model's approach.
3.  **Max Text Length**:
    - We will not enforce a hard limit on text length in the wrapper. We will let the underlying model/pipeline handle tokenization limits and throw errors if the input exceeds the model's capacity (e.g., context window). This allows for maximum flexibility as models improve.

### Error Handling
We will adopt the robust error handling strategy from `TransformersJSTranscriptionModel`:

1.  **Initialization Failures**:
    - Wrap model loading (`from_pretrained` / `pipeline`) in a `try-catch` block.
    - On failure:
        - Reset `this.initializationPromise`, `this.isInitialized`, and `this.pipelineInstance` to `undefined`. This ensures that subsequent calls trigger a fresh initialization attempt (enabling retries for network glitches).
        - Throw a `LoadSettingError` with a descriptive message (e.g., "Failed to initialize TransformersJS speech model: ...").
2.  **Generation Failures**:
    - Wrap the `pipeline` execution in `try-catch`.
    - Throw a clear `Error` with the underlying message to allow the AI SDK's retry mechanism (`maxRetries`) to function if appropriate.
3.  **Worker Errors**:
    - Listen for `status: 'error'` messages from the worker.
    - Reject the pending promise with the error message received from the worker.
4.  **Validation**:
    - If a model requires a speaker (e.g., multi-speaker VITS) and none is provided via `voice` or settings, throw a specific validation error immediately before calling the pipeline.

## 5. WAV Encoding Helper
Since `transformers.js` returns raw audio samples, we need a utility to encode this into a WAV container so it can be consumed as a standard audio file.
- Create `packages/built-in-ai/packages/transformers-js/src/util/wav-encoder.ts` (or similar).
- Function: `encodeWAV(samples: Float32Array, sampleRate: number): Uint8Array`.

### Audio Formatting Standards
To ensure compatibility and standard output, the encoder will adhere to the following specifications:
- **Container**: WAV (RIFF).
- **Encoding**: Linear PCM, 16-bit signed integer (Little Endian).
- **Channels**: Mono (1 channel) by default. If the model outputs multiple channels, we will preserve them (interleaved).
- **Sample Rate**: As returned by the model (e.g., 16000, 24000, 44100 Hz).
- **Conversion Logic**:
    - **Input**: Float32Array (range -1.0 to 1.0).
    - **Process**: Clamp values to [-1.0, 1.0] to prevent wrapping distortion, scale by 32767, and round to the nearest integer.
    - **Output**: Uint8Array (representing Int16 bytes).
- **MIME Type**: `audio/wav`.

## 6. Example Usage

```typescript
const model = new TransformersJSSpeechModel('onnx-community/Supertonic-TTS-ONNX', {
  dtype: 'fp32', // or q8, etc.
});

const result = await generateSpeech({
  model,
  text: "Hello world",
  voice: "https://.../voice.bin"
});
```

## 7. Exports & Wiring

To make the new functionality accessible, we need to wire it into the package entry points and provider interface.

### File Exports
1.  **`src/speech/index.ts`**: Create an index file to export the model and settings.
    ```typescript
    export * from './transformers-js-speech-model';
    export * from './transformers-js-speech-settings';
    ```
2.  **`src/index.ts`**: Export the speech module.
    ```typescript
    export * from './speech';
    ```

### Provider Integration (`src/transformers-js-provider.ts`)
1.  **Interface Update**: Add `textToSpeech` to the `TransformersJSProvider` interface.
    ```typescript
    textToSpeech(
      modelId: string,
      settings?: TransformersJSSpeechSettings,
    ): SpeechModelV2;
    ```
2.  **Implementation Update**: Update the `createTransformersJS` factory function to implement `textToSpeech`.
    ```typescript
    const provider = function (
      modelId: TransformersJSModelId,
      settings?: TransformersJSModelSettings,
    ) {
      // ... existing code ...
    } as TransformersJSProvider;

    provider.textToSpeech = (modelId, settings) =>
      new TransformersJSSpeechModel(modelId, settings);
    ```

### Dependencies
- No new external dependencies are required if we implement the WAV encoder utility manually.
- Ensure `@huggingface/transformers` is up to date in `package.json` to support the latest pipelines.

## 8. Next Steps
1.  Implement `encodeWAV` utility.
2.  Implement `TransformersJSSpeechModel` class.
3.  Update `TransformersJSProvider` and exports.
4.  Export from package.
