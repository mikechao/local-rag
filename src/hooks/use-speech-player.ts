import { useCallback, useRef } from "react";

export function useSpeechPlayer() {
  const audioContext = useRef<AudioContext | null>(null);
  const nextStartTime = useRef<number>(0);
  const isPlaying = useRef(false);

  const initAudioContext = useCallback(() => {
    if (!audioContext.current) {
      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("AudioContext is not supported in this browser.");
      }
      audioContext.current = new AudioContextCtor();
    }
    if (audioContext.current.state === "suspended") {
      audioContext.current.resume();
    }
  }, []);

  const playChunk = useCallback(
    (audioData: Float32Array, sampleRate: number) => {
      initAudioContext();
      const ctx = audioContext.current;
      if (!ctx) {
        return;
      }

      const buffer = ctx.createBuffer(1, audioData.length, sampleRate);
      buffer.getChannelData(0).set(audioData);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      // Schedule next chunk
      const startTime = Math.max(currentTime, nextStartTime.current);
      source.start(startTime);
      nextStartTime.current = startTime + buffer.duration;
    },
    [initAudioContext],
  );

  const playStream = useCallback(
    async (
      stream: AsyncGenerator<{ audio: Float32Array; sampling_rate: number }>,
    ) => {
      isPlaying.current = true;
      try {
        for await (const chunk of stream) {
          if (!isPlaying.current) break;
          playChunk(chunk.audio, chunk.sampling_rate);
        }
      } catch (e) {
        console.error("Error playing stream", e);
      } finally {
        isPlaying.current = false;
      }
    },
    [playChunk],
  );

  const stop = useCallback(() => {
    isPlaying.current = false;
    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }
    nextStartTime.current = 0;
  }, []);

  return { playStream, stop };
}
