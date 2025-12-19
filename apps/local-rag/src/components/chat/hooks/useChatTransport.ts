import { useEffect, useRef, useState } from "react";
import { BuiltInAIChatTransport } from "@/lib/built-in-ai-chat-transport";

export function useChatTransport(sessionKey?: string | null) {
  const [chatTransport, setChatTransport] = useState(
    () => new BuiltInAIChatTransport(),
  );
  const lastSessionKeyRef = useRef<string | null | undefined>(sessionKey);

  useEffect(() => {
    if (lastSessionKeyRef.current === sessionKey) return;
    lastSessionKeyRef.current = sessionKey;
    setChatTransport(new BuiltInAIChatTransport());
  }, [sessionKey]);

  useEffect(() => {
    chatTransport.warmup().catch(console.error);
  }, [chatTransport]);

  useEffect(() => {
    return () => {
      chatTransport.destroy();
    };
  }, [chatTransport]);

  return chatTransport;
}
