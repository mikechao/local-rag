import type { ChatStatus } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalRAGMessage, RetrievalStatus } from "@/lib/local-rag-message";
import {
  createChat,
  deleteChat,
  getChats,
  getDefaultChatTitle,
  hasUserMessages,
  loadChat,
  updateChatTitle,
  type ChatSummary,
} from "@/lib/chat-storage";
import { generateChatTitle } from "@/lib/chat-title";

type UseChatStorageArgs = {
  setRetrievalStatus: (status: RetrievalStatus | null) => void;
  setSourcesOpenByMessageId: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  resetInput: () => void;
};

type HandleNewChatArgs = {
  messages: LocalRAGMessage[];
  status: ChatStatus;
};

export function useChatStorage({
  setRetrievalStatus,
  setSourcesOpenByMessageId,
  resetInput,
}: UseChatStorageArgs) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(true);
  const [chatToDelete, setChatToDelete] = useState<ChatSummary | null>(null);
  const [pendingMessages, setPendingMessages] = useState<
    LocalRAGMessage[] | null
  >(null);
  const [loadedQuotaOverflowState, setLoadedQuotaOverflowState] =
    useState(false);

  const attachmentUrlsRef = useRef<string[]>([]);

  const revokeAttachmentUrls = useCallback(() => {
    for (const url of attachmentUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    attachmentUrlsRef.current = [];
  }, []);

  const resetChatIndicators = useCallback(() => {
    setRetrievalStatus(null);
    setSourcesOpenByMessageId({});
  }, [setRetrievalStatus, setSourcesOpenByMessageId]);

  const loadChatAndActivate = useCallback(
    async (chatId: string) => {
      setIsChatLoading(true);
      const {
        messages: loadedMessages,
        attachmentUrls,
        quotaOverflowState,
      } = await loadChat(chatId);
      revokeAttachmentUrls();
      attachmentUrlsRef.current = attachmentUrls;
      setPendingMessages(loadedMessages);
      setActiveChatId(chatId);
      setLoadedQuotaOverflowState(quotaOverflowState);
      resetChatIndicators();
      setIsChatLoading(false);
    },
    [resetChatIndicators, revokeAttachmentUrls],
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setIsChatLoading(true);
      const existingChats = await getChats();
      if (cancelled) return;

      if (existingChats.length === 0) {
        const newChat = await createChat();
        if (cancelled) return;
        setChats([newChat]);
        setPendingMessages([]);
        setActiveChatId(newChat.id);
        setLoadedQuotaOverflowState(false);
        setIsChatLoading(false);
        return;
      }

      setChats(existingChats);
      const initialChat = existingChats[0];
      if (!initialChat) {
        setIsChatLoading(false);
        return;
      }
      await loadChatAndActivate(initialChat.id);
    };

    init().catch((error) => {
      console.warn("[ChatStorage] Failed to load chats", error);
      setIsChatLoading(false);
    });

    return () => {
      cancelled = true;
      revokeAttachmentUrls();
    };
  }, [loadChatAndActivate, revokeAttachmentUrls]);

  const handleNewChat = useCallback(
    async ({ messages, status }: HandleNewChatArgs) => {
      if (status !== "ready") return;
      if (!activeChatId) return;
      if (!hasUserMessages(messages)) return;

      const title = await generateChatTitle(messages);
      if (title) {
        await updateChatTitle(activeChatId, title);
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === activeChatId ? { ...chat, title } : chat,
          ),
        );
      }

      const newChat = await createChat(getDefaultChatTitle());
      setChats((prev) => prev.concat(newChat));
      revokeAttachmentUrls();
      setPendingMessages([]);
      setActiveChatId(newChat.id);
      setLoadedQuotaOverflowState(false);
      resetChatIndicators();
      resetInput();
    },
    [activeChatId, resetChatIndicators, resetInput, revokeAttachmentUrls],
  );

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      if (chatId === activeChatId) return;
      try {
        await loadChatAndActivate(chatId);
      } catch (error) {
        console.warn("[ChatStorage] Failed to switch chat", error);
        setIsChatLoading(false);
      }
    },
    [activeChatId, loadChatAndActivate],
  );

  const confirmDeleteChat = useCallback(async () => {
    if (!chatToDelete) return;
    const targetId = chatToDelete.id;
    setChatToDelete(null);
    await deleteChat(targetId);
    setChats((prev) => prev.filter((chat) => chat.id !== targetId));

    if (targetId === activeChatId) {
      const newChat = await createChat(getDefaultChatTitle());
      setChats((prev) => prev.concat(newChat));
      revokeAttachmentUrls();
      setPendingMessages([]);
      setActiveChatId(newChat.id);
      setLoadedQuotaOverflowState(false);
      resetChatIndicators();
      resetInput();
    }
  }, [
    activeChatId,
    chatToDelete,
    resetChatIndicators,
    resetInput,
    revokeAttachmentUrls,
  ]);

  const clearPendingMessages = useCallback(() => {
    setPendingMessages(null);
  }, []);

  return {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    isChatLoading,
    chatToDelete,
    setChatToDelete,
    pendingMessages,
    setPendingMessages,
    clearPendingMessages,
    handleNewChat,
    handleSelectChat,
    confirmDeleteChat,
    loadedQuotaOverflowState,
    setLoadedQuotaOverflowState,
  };
}
