import type { ChatStatus } from "ai";
import { useEffect, useRef, useState } from "react";
import { useSpeechPlayer } from "@/hooks/use-speech-player";
import { generateSpeechStream, TextStream } from "@/lib/models/speechModel";
import type { LocalRAGMessage } from "@/lib/local-rag-message";
import { getMessageText } from "../chat-message-utils";

type UseAutoSpeakArgs = {
  messages: LocalRAGMessage[];
  status: ChatStatus;
};

export function useAutoSpeak({ messages, status }: UseAutoSpeakArgs) {
  const [autoSpeak, setAutoSpeak] = useState(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const lastMessageLengthRef = useRef(0);
  const textStreamRef = useRef<TextStream | null>(null);
  const { playStream, stop } = useSpeechPlayer();

  useEffect(() => {
    if (!autoSpeak) {
      if (textStreamRef.current) {
        textStreamRef.current.close();
        textStreamRef.current = null;
        stop();
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") return;

    // If we just turned on auto-speak and the message is already done, don't speak it
    if (status === "ready" && lastMessage.id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMessage.id;
      const fullText = getMessageText(lastMessage);
      lastMessageLengthRef.current = fullText.length;
      return;
    }

    // New message started
    if (lastMessage.id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMessage.id;
      lastMessageLengthRef.current = 0;

      // Stop previous if any
      if (textStreamRef.current) {
        textStreamRef.current.close();
      }
      stop();

      // Start new stream
      const stream = new TextStream();
      textStreamRef.current = stream;

      // Start playing (fire and forget, handled by hook)
      const audioGenerator = generateSpeechStream(stream);
      playStream(audioGenerator);
    }

    // Calculate delta
    const fullText = getMessageText(lastMessage);

    const newLength = fullText.length;

    // Handle case where text shrinks (shouldn't now, but keep guard)
    if (newLength < lastMessageLengthRef.current) {
      lastMessageLengthRef.current = newLength;
    }

    const delta = fullText.slice(lastMessageLengthRef.current);

    if (delta) {
      textStreamRef.current?.push(delta);
      lastMessageLengthRef.current = newLength;
    }

    if (status === "ready" && lastMessage.id === lastMessageIdRef.current) {
      textStreamRef.current?.close();
      textStreamRef.current = null;
    }
  }, [messages, status, autoSpeak, playStream, stop]);

  return { autoSpeak, setAutoSpeak };
}
