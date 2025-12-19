import { useEffect, useRef, useState } from "react";
import { BuiltInAIChatTransport } from "@/lib/built-in-ai-chat-transport";

export function useChatTransport(sessionKey?: string | null) {
  const [chatTransport, setChatTransport] = useState(
    () => new BuiltInAIChatTransport(),
  );
  const [isWarming, setIsWarming] = useState(true);
  const lastSessionKeyRef = useRef<string | null | undefined>(sessionKey);

  useEffect(() => {
    if (lastSessionKeyRef.current === sessionKey) return;
    lastSessionKeyRef.current = sessionKey;
    setIsWarming(true);
    setChatTransport(new BuiltInAIChatTransport());
  }, [sessionKey]);

  useEffect(() => {
    let cancelled = false;
    setIsWarming(true);
    chatTransport
      .warmup()
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setIsWarming(false);
        }
      });
    return () => {
      cancelled = true;
      chatTransport.destroy();
    };
  }, [chatTransport]);

  return { chatTransport, isWarming };
}
