# Voice Input Implementation Plan

## Goal
Add a microphone button to the chat interface that allows users to record audio, visualize the waveform, and transcribe the audio using the local Gemini Nano model.

## Dependencies
- `react-voice-visualizer`: For audio recording and waveform visualization.

## Components

### `WhisperDownload`
A new component `apps/local-rag/src/components/WhisperDownload.tsx` to manage the download of the `Xenova/whisper-base` model.
- Wraps `TransformersJSDownloadCard` to handle the download logic and UI.
- Uses `transformersJS` to check availability and download.

### `VoiceInput`
A new component `apps/local-rag/src/components/VoiceInput.tsx` that handles the recording logic and UI.

**Props:**
- `onTranscription`: `(text: string) => void` - Callback when transcription is complete.
- `isModelAvailable`: `boolean` - To disable if the transcription model is not ready.

**State/Hooks:**
- `useVoiceVisualizer`: From `react-voice-visualizer`.
- `isTranscribing`: To show loading state during Gemini Nano processing.

**UI:**
- **Idle State**: Displays a microphone button (e.g., inside `PromptInputTools`).
    - If `isModelAvailable` is false, the button is disabled and shows a tooltip: "Download Whisper model to enable voice input".
- **Recording State**: The entire `PromptInputFooter` content (tools, model selector, submit button) is hidden/replaced by the `VoiceVisualizer` waveform and control buttons (Stop/Cancel).

### `ChatInterface` Updates
- Import and use `VoiceInput` in `PromptInputFooter` or `PromptInputTools`.
- Pass a handler to `VoiceInput` that appends the transcribed text to the current `input` state.

## Implementation Steps

1.  **Install Dependency**
    ```bash
    pnpm add react-voice-visualizer
    ```

2.  **Create `WhisperDownload` Component**
    - Implement model download logic for `Xenova/whisper-base`.
    - Add to `apps/local-rag/src/routes/models.tsx`.

3.  **Create `VoiceInput` Component**
    - Implement `useVoiceVisualizer`.
    - Handle `saveAudio` (or equivalent) to get the blob.
    - Implement `transcribeAudio` function:
        - Initialize `transformersJS` model (e.g. "Xenova/whisper-base").
        - Call `experimental_transcribe` with the model and audio blob.
        - Call `onTranscription` with the result text.

4.  **Integrate into `ChatInterface`**
    - Replace or augment the existing `PromptInputTools` with `VoiceInput`.
    - Ensure `VoiceInput` updates the `input` state of `ChatInterface`.
    - Pass the availability of the Whisper model to `VoiceInput`.

5.  **Transformers.js Transcription Logic**
    - Ensure `@built-in-ai/transformers-js` is installed/imported.
    - Use `experimental_transcribe` from `ai` SDK.

## Technical Details

### Transcription with Transformers.js
```typescript
import { experimental_transcribe as transcribe } from "ai";
import { transformersJS } from "@built-in-ai/transformers-js";

// ... inside component
const transcribeAudio = async (audioBlob: Blob) => {
  // Convert Blob to ArrayBuffer for AI SDK
  const arrayBuffer = await audioBlob.arrayBuffer();

  // Basic transcription
  const transcript = await transcribe({
    model: transformersJS.transcription("Xenova/whisper-base"),
    audio: arrayBuffer,
  });

  return transcript.text;
}
```

### UI Considerations
- The waveform replaces the footer elements while recording.
- The user should be able to cancel recording.
- Feedback during transcription (spinner).

## Verification
- Test microphone access.
- Test recording start/stop.
- Test visualization rendering.
- Test transcription accuracy with Gemini Nano.
