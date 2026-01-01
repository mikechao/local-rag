import { useChat } from "@ai-sdk/react";
import { Link } from "@tanstack/react-router";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { DeleteChatDialog } from "@/components/chat/DeleteChatDialog";
import { SummaryErrorDialog } from "@/components/chat/SummaryErrorDialog";
import { SummaryLoaddingDialog } from "@/components/chat/SummaryLoaddingDialog";
import { SummaryReviewDialog } from "@/components/chat/SummaryReviewDialog";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { generateChatTitle } from "@/lib/chat-title";
import {
  createChat,
  getDefaultChatTitle,
  hasUserMessages,
  saveMessage,
  updateChatTitle,
} from "@/lib/chat-storage";
import { summarizeChat } from "@/lib/chat-summarize";
import { warmupEmbeddingModel } from "@/lib/embedding-worker";
import type {
  LocalRAGMessage,
  ModelUsage,
  RetrievalStatus,
} from "@/lib/local-rag-message";
import { isSpeechModelReadyFlag } from "@/lib/models/speechModel";
import { hasCachedWhisperWeights } from "@/lib/models/whisperModel";
import { useAutoSpeak } from "@/components/chat/hooks/useAutoSpeak";
import { useChatStorage } from "@/components/chat/hooks/useChatStorage";
import { useChatTransport } from "@/components/chat/hooks/useChatTransport";

export function ChatInterface() {
  const [isModelAvailable] = useState<boolean | null>(true);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-nano");
  const [isWhisperAvailable, setIsWhisperAvailable] = useState(false);
  const [isSpeechAvailable, setIsSpeechAvailable] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [retrievalStatus, setRetrievalStatus] =
    useState<RetrievalStatus | null>(null);
  const [input, setInput] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizationError, setSummarizationError] = useState<string | null>(
    null,
  );
  const [generatedSummary, setGeneratedSummary] = useState<string | null>(null);
  const [summaryInputValue, setSummaryInputValue] = useState("");

  const promptAreaRef = useRef<HTMLDivElement | null>(null);
  const titleGenerationRef = useRef<Set<string>>(new Set());

  // Sync summary input value with generated summary
  useEffect(() => {
    if (generatedSummary !== null) {
      setSummaryInputValue(generatedSummary);
    }
  }, [generatedSummary]);

  useEffect(() => {
    const checkModels = async () => {
      const isWhisperCached = await hasCachedWhisperWeights();
      setIsWhisperAvailable(isWhisperCached);
      const isSpeechReady = isSpeechModelReadyFlag();
      setIsSpeechAvailable(isSpeechReady);
    };
    checkModels();
    // Pre-warm embedding model for faster RAG retrieval
    warmupEmbeddingModel().catch(console.error);
  }, []);

  const {
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
  } = useChatStorage({
    setRetrievalStatus,
    resetInput: () => setInput(""),
  });

  const { chatTransport, quotaOverflow, clearQuotaOverflow } = useChatTransport(
    activeChatId,
    { activeChatId },
  );

  const {
    messages,
    setMessages,
    sendMessage,
    error,
    status,
    stop: stopChat,
  } = useChat<LocalRAGMessage>({
    transport: chatTransport,
    id: activeChatId ?? "pending-chat",
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onData: (dataPart) => {
      if (dataPart.type === "data-retrievalStatus") {
        setRetrievalStatus(dataPart.data);
      }
    },
    onError: (err) => {
      console.error("ChatInterface chat error:", err);
    },
  });

  useEffect(() => {
    if (pendingMessages === null) return;
    setMessages(pendingMessages);
    clearPendingMessages();
  }, [clearPendingMessages, pendingMessages, setMessages]);

  // Update chats list when quota overflow happens
  useEffect(() => {
    if (quotaOverflow && activeChatId) {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, quotaOverflowState: true }
            : chat,
        ),
      );
    }
  }, [quotaOverflow, activeChatId, setChats]);

  // Combine quota overflow state from transport and loaded state
  const isQuotaOverflowed = quotaOverflow || loadedQuotaOverflowState;

  const handleNewChatWithSummary = useCallback(async () => {
    if (!activeChatId || messages.length === 0) return;

    setIsSummarizing(true);
    setSummarizationError(null);

    try {
      // Generate summary
      const summary = await summarizeChat(messages);

      // Show summary for review
      setGeneratedSummary(summary);
      setIsSummarizing(false);
    } catch (error) {
      console.error("Failed to summarize chat:", error);
      setSummarizationError(
        error instanceof Error ? error.message : "Failed to summarize chat",
      );
      setIsSummarizing(false);
    }
  }, [activeChatId, messages]);

  const handleRegenerateSummary = useCallback(async () => {
    if (!activeChatId || messages.length === 0) return;

    setGeneratedSummary(null);
    setIsSummarizing(true);
    setSummarizationError(null);

    try {
      const summary = await summarizeChat(messages);
      setGeneratedSummary(summary);
      setIsSummarizing(false);
    } catch (error) {
      console.error("Failed to regenerate summary:", error);
      setSummarizationError(
        error instanceof Error ? error.message : "Failed to regenerate summary",
      );
      setIsSummarizing(false);
      setGeneratedSummary(null);
    }
  }, [activeChatId, messages]);

  const handleProceedWithSummary = useCallback(async () => {
    if (!activeChatId || !summaryInputValue.trim()) return;

    try {
      // Create new chat
      const newChat = await createChat(getDefaultChatTitle());

      // Create first message with edited summary
      const summaryMessage: LocalRAGMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Summary of previous chat:\n\n${summaryInputValue.trim()}`,
          },
        ],
      };

      // Save the summary message
      await saveMessage(newChat.id, summaryMessage);

      // Update UI state to switch to new chat
      setChats((prev) => prev.concat(newChat));
      setPendingMessages([summaryMessage]);
      setActiveChatId(newChat.id);
      setRetrievalStatus(null);
      setInput("");
      setLoadedQuotaOverflowState(false);
      clearQuotaOverflow();
      setGeneratedSummary(null);
      setSummaryInputValue("");
    } catch (error) {
      console.error("Failed to proceed with summary:", error);
      // Keep the dialog open on error so user doesn't lose their edits
    }
  }, [
    activeChatId,
    summaryInputValue,
    setChats,
    setPendingMessages,
    setActiveChatId,
    setRetrievalStatus,
    setInput,
    setLoadedQuotaOverflowState,
    clearQuotaOverflow,
  ]);

  const handleNewChatWithoutSummary = useCallback(async () => {
    if (!activeChatId) return;

    try {
      setSummarizationError(null);

      // Generate and save title for current chat if it has messages
      if (hasUserMessages(messages)) {
        const title = await generateChatTitle(messages);
        if (title) {
          await updateChatTitle(activeChatId, title);
          setChats((prev) =>
            prev.map((chat) =>
              chat.id === activeChatId ? { ...chat, title } : chat,
            ),
          );
        }
      }

      // Create new chat
      const newChat = await createChat(getDefaultChatTitle());

      // Update UI state
      setChats((prev) => prev.concat(newChat));
      setPendingMessages([]);
      setActiveChatId(newChat.id);
      setRetrievalStatus(null);
      setInput("");
      setLoadedQuotaOverflowState(false);
      clearQuotaOverflow();
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  }, [
    activeChatId,
    messages,
    setChats,
    setPendingMessages,
    setActiveChatId,
    setRetrievalStatus,
    setInput,
    setLoadedQuotaOverflowState,
    clearQuotaOverflow,
  ]);

  const latestModelUsage = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const parts = messages[i]?.parts;
      if (!parts) continue;
      for (let j = parts.length - 1; j >= 0; j -= 1) {
        const part = parts[j];
        if (part.type !== "data-modelUsage") continue;
        const data = part.data as ModelUsage | undefined;
        const usedTokens = data?.inputUsage;
        const maxTokens = data?.inputQuota;
        if (typeof usedTokens !== "number" || typeof maxTokens !== "number") {
          return null;
        }
        if (!Number.isFinite(usedTokens) || !Number.isFinite(maxTokens)) {
          return null;
        }
        if (maxTokens <= 0) return null;
        return { usedTokens, maxTokens };
      }
    }
    return null;
  })();

  const { autoSpeak, setAutoSpeak } = useAutoSpeak({ messages, status });

  useEffect(() => {
    if (status !== "ready") return;

    const root = promptAreaRef.current;
    const textarea = root?.querySelector?.(
      'textarea[name="message"]',
    ) as HTMLTextAreaElement | null;
    if (!root || !textarea) return;

    const active = document.activeElement;
    if (active && active !== document.body && !root.contains(active)) return;

    requestAnimationFrame(() => textarea.focus());
  }, [status]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!activeChatId) return;
    if (isChatLoading) return;

    const activeChat = chats.find((chat) => chat.id === activeChatId);
    if (!activeChat) return;
    if (activeChat.title !== getDefaultChatTitle()) return;
    if (titleGenerationRef.current.has(activeChatId)) return;

    const hasAssistantReply = messages.some(
      (message) => message.role === "assistant",
    );
    if (!hasAssistantReply) return;
    if (!hasUserMessages(messages)) return;

    titleGenerationRef.current.add(activeChatId);
    generateChatTitle(messages)
      .then((title) => {
        if (!title) return;
        return updateChatTitle(activeChatId, title).then(() => {
          setChats((prev) =>
            prev.map((chat) =>
              chat.id === activeChatId ? { ...chat, title } : chat,
            ),
          );
        });
      })
      .catch((error) => {
        console.warn("[ChatTitle] Failed to auto-generate title", error);
      });
  }, [activeChatId, chats, isChatLoading, messages, status, setChats]);

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  if (isModelAvailable === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="size-8" />
        </div>
        <h2 className="text-xl font-semibold">Model Not Available</h2>
        <p className="max-w-md text-muted-foreground">
          The local AI model is not downloaded or available in your browser.
          Please visit the Models page to download the Gemini Nano model.
        </p>
        <Button asChild>
          <Link to="/models">Go to Models Page</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] overflow-hidden rounded-lg border bg-background shadow-sm">
      <Collapsible
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        className="flex flex-1"
      >
        <ChatHistoryPanel
          chats={chats}
          activeChatId={activeChatId}
          isChatLoading={isChatLoading}
          onSelectChat={handleSelectChat}
          onRequestDeleteChat={setChatToDelete}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {isQuotaOverflowed ? (
            <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>
                    The built-in AI model quota has been exceeded. You can start
                    a new chat, or use &quot;Summarize + New Chat&quot; which
                    will create a concise summary of this conversation and start
                    fresh with that context.
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleNewChatWithoutSummary}
                  >
                    New Chat
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleNewChatWithSummary}
                  >
                    Summarize + New Chat
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <ChatMessageList
            messages={messages}
            status={status}
            retrievalStatus={retrievalStatus}
            copiedMessageId={copiedMessageId}
            setCopiedMessageId={setCopiedMessageId}
            error={error}
          />

          <ChatComposer
            input={input}
            setInput={setInput}
            onInputChange={handleInputChange}
            onSubmit={(message) => {
              if (!activeChatId || isChatLoading) return;
              setRetrievalStatus(null);
              const trimmedText = message.text.trim();
              const hasFiles = message.files.length > 0;

              if (!trimmedText && !hasFiles) return;

              void sendMessage(
                hasFiles
                  ? trimmedText
                    ? { text: trimmedText, files: message.files }
                    : { files: message.files }
                  : { text: trimmedText },
                { body: { modelId: selectedModel } },
              );

              setInput("");
            }}
            onNewChat={() => handleNewChat({ messages, status })}
            onToggleHistory={() => setIsHistoryOpen((prev) => !prev)}
            status={status}
            isChatLoading={isChatLoading}
            activeChatId={activeChatId}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            autoSpeak={autoSpeak}
            setAutoSpeak={setAutoSpeak}
            isSpeechAvailable={isSpeechAvailable}
            isWhisperAvailable={isWhisperAvailable}
            latestModelUsage={latestModelUsage}
            promptAreaRef={promptAreaRef}
            onStopChat={stopChat}
            quotaOverflow={isQuotaOverflowed}
          />
        </div>
      </Collapsible>

      <DeleteChatDialog
        chatToDelete={chatToDelete}
        onCancel={() => setChatToDelete(null)}
        onConfirm={confirmDeleteChat}
      />

      <SummaryLoaddingDialog open={isSummarizing} />

      <SummaryReviewDialog
        open={generatedSummary !== null}
        summary={summaryInputValue}
        onSummaryChange={setSummaryInputValue}
        onRegenerate={handleRegenerateSummary}
        onProceed={handleProceedWithSummary}
        onDismiss={() => {
          setGeneratedSummary(null);
          setSummaryInputValue("");
        }}
      />

      <SummaryErrorDialog
        error={summarizationError}
        onProceedWithoutSummary={handleNewChatWithoutSummary}
        onRetry={() => {
          setSummarizationError(null);
          handleNewChatWithSummary();
        }}
        onDismiss={() => setSummarizationError(null)}
      />
    </div>
  );
}
