import { useEffect, useRef } from "react";
import { BuiltInAIChatTransport } from "@/lib/built-in-ai-chat-transport";

export function useChatTransport() {
  const chatTransportRef = useRef<BuiltInAIChatTransport | null>(null);
  if (!chatTransportRef.current) {
    chatTransportRef.current = new BuiltInAIChatTransport();
  }
  const chatTransport = chatTransportRef.current;

  useEffect(() => {
    chatTransport.warmup().catch(console.error);
  }, [chatTransport]);

  return chatTransport;
}
