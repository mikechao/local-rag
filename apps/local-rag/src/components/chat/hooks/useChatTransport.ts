import { useCallback, useEffect, useRef, useState } from "react";
import { BuiltInAIChatTransport } from "@/lib/built-in-ai-chat-transport";
import { updateChatQuotaOverflowState } from "@/lib/chat-storage";

type UseChatTransportOptions = {
  onQuotaOverflow?: (event: Event) => void;
  activeChatId?: string | null;
};

export function useChatTransport(
  sessionKey?: string | null,
  options: UseChatTransportOptions = {},
) {
  const [quotaOverflow, setQuotaOverflow] = useState(false);
  const onQuotaOverflowRef = useRef(options.onQuotaOverflow);
  const activeChatIdRef = useRef(options.activeChatId);
  onQuotaOverflowRef.current = options.onQuotaOverflow;
  activeChatIdRef.current = options.activeChatId;

  const handleQuotaOverflow = useCallback((event: Event) => {
    setQuotaOverflow(true);

    // Persist the quota overflow state to the database
    const chatId = activeChatIdRef.current;
    if (chatId) {
      updateChatQuotaOverflowState(chatId, true).catch((error) => {
        console.error("Failed to persist quota overflow state:", error);
      });
    }

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
