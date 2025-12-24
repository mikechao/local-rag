import { useCallback, useEffect, useRef, useState } from "react";
import { BuiltInAIChatTransport } from "@/lib/built-in-ai-chat-transport";

type UseChatTransportOptions = {
  onQuotaOverflow?: (event: Event) => void;
};

export function useChatTransport(
  sessionKey?: string | null,
  options: UseChatTransportOptions = {},
) {
  const [quotaOverflow, setQuotaOverflow] = useState(false);
  const onQuotaOverflowRef = useRef(options.onQuotaOverflow);
  onQuotaOverflowRef.current = options.onQuotaOverflow;

  const handleQuotaOverflow = useCallback((event: Event) => {
    setQuotaOverflow(true);
    onQuotaOverflowRef.current?.(event);
  }, []);

  const [chatTransport, setChatTransport] = useState(
    () =>
      new BuiltInAIChatTransport({
        onQuotaOverflow: handleQuotaOverflow,
      }),
  );
  const [isWarming, setIsWarming] = useState(true);
  const lastSessionKeyRef = useRef<string | null | undefined>(sessionKey);

  useEffect(() => {
    if (lastSessionKeyRef.current === sessionKey) return;
    lastSessionKeyRef.current = sessionKey;
    setIsWarming(true);
    setChatTransport(
      new BuiltInAIChatTransport({
        onQuotaOverflow: handleQuotaOverflow,
      }),
    );
  }, [handleQuotaOverflow, sessionKey]);

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

  return {
    chatTransport,
    isWarming,
    quotaOverflow,
    clearQuotaOverflow: () => setQuotaOverflow(false),
  };
}
