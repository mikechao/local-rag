import { useChat } from "@ai-sdk/react";
import { Link } from "@tanstack/react-router";
import {
  type FileUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import {
  AlertCircle,
  Loader2Icon,
  MicIcon,
  Paperclip,
  PanelLeftIcon,
  PlusIcon,
  Trash2Icon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { CopyMessage } from "@/components/CopyMessage";
import { LocalModelSelector } from "@/components/LocalModelSelector";
import { RetrievalResultsCarousel } from "@/components/RetrievalResultsCarousel";
import { SpeakMessage } from "@/components/SpeakMessage";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VoiceInput } from "@/components/VoiceInput";
import { useSpeechPlayer } from "@/hooks/use-speech-player";
import { BuiltInAIChatTransport } from "@/lib/built-in-ai-chat-transport";
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
import { warmupEmbeddingModel } from "@/lib/embedding-worker";
import type { LocalRAGMessage, RetrievalStatus } from "@/lib/local-rag-message";
import {
  generateSpeechStream,
  isSpeechModelReadyFlag,
  TextStream,
} from "@/lib/models/speechModel";
import { hasCachedWhisperWeights } from "@/lib/models/whisperModel";
import type { RetrievalResult } from "@/lib/retrieval";

export function ChatInterface() {
  const [isModelAvailable] = useState<boolean | null>(true);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-nano");
  const [isWhisperAvailable, setIsWhisperAvailable] = useState(false);
  const [isSpeechAvailable, setIsSpeechAvailable] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(true);
  const [chatToDelete, setChatToDelete] = useState<ChatSummary | null>(null);
  const [retrievalStatus, setRetrievalStatus] =
    useState<RetrievalStatus | null>(null);
  const [sourcesOpenByMessageId, setSourcesOpenByMessageId] = useState<
    Record<string, boolean>
  >({});

  const lastMessageIdRef = useRef<string | null>(null);
  const lastMessageLengthRef = useRef(0);
  const textStreamRef = useRef<TextStream | null>(null);
  const promptAreaRef = useRef<HTMLDivElement | null>(null);
  const attachmentUrlsRef = useRef<string[]>([]);
  const pendingMessagesRef = useRef<LocalRAGMessage[] | null>(null);
  const titleGenerationRef = useRef<Set<string>>(new Set());
  const { playStream, stop } = useSpeechPlayer();

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

  const chatTransportRef = useRef<BuiltInAIChatTransport | null>(null);
  if (!chatTransportRef.current) {
    chatTransportRef.current = new BuiltInAIChatTransport();
  }
  const chatTransport = chatTransportRef.current;

  // Warm up when the transport supports it (BuiltInAIChatTransport only)
  useEffect(() => {
    chatTransport.warmup().catch(console.error);
  }, [chatTransport]);

  const [input, setInput] = useState("");

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
  });

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
  }, [activeChatId, chats, isChatLoading, messages, status]);

  const revokeAttachmentUrls = useCallback(() => {
    for (const url of attachmentUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    attachmentUrlsRef.current = [];
  }, []);

  const applyPendingMessages = useCallback(() => {
    if (!pendingMessagesRef.current) return;
    setMessages(pendingMessagesRef.current);
    pendingMessagesRef.current = null;
  }, [setMessages]);

  useEffect(() => {
    if (!activeChatId) return;
    applyPendingMessages();
  }, [activeChatId, applyPendingMessages]);

  const loadChatAndActivate = useCallback(
    async (chatId: string) => {
      setIsChatLoading(true);
      const { messages: loadedMessages, attachmentUrls } = await loadChat(chatId);
      revokeAttachmentUrls();
      attachmentUrlsRef.current = attachmentUrls;
      pendingMessagesRef.current = loadedMessages;
      setActiveChatId(chatId);
      setRetrievalStatus(null);
      setSourcesOpenByMessageId({});
      setIsChatLoading(false);
    },
    [revokeAttachmentUrls],
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
        pendingMessagesRef.current = [];
        setActiveChatId(newChat.id);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleNewChat = useCallback(async () => {
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
    pendingMessagesRef.current = [];
    setActiveChatId(newChat.id);
    setRetrievalStatus(null);
    setSourcesOpenByMessageId({});
    setInput("");
  }, [status, activeChatId, messages, revokeAttachmentUrls]);

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
      pendingMessagesRef.current = [];
      setActiveChatId(newChat.id);
      setRetrievalStatus(null);
      setSourcesOpenByMessageId({});
      setInput("");
    }
  }, [activeChatId, chatToDelete, revokeAttachmentUrls]);

  const getMessageText = (message: LocalRAGMessage) => {
    if (message.parts) {
      return message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
    }
    return "";
  };

  const getCopyableText = (message: LocalRAGMessage) => {
    if (message.parts) {
      return message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text?.trim())
        .filter(Boolean)
        .join("\n\n");
    }
    return getMessageText(message);
  };

  const getAttachments = (message: LocalRAGMessage) => {
    if (!message.parts) return [];
    return message.parts
      .filter((part) => part.type === "file")
      .map((part) => {
        if (part.type === "file") {
          return {
            ...part,
            url: part.url,
            mediaType: part.mediaType,
            filename: part.filename || "Image",
          };
        }
        return part;
      });
  };

  const renderRetrievalStatus = (statusPart: RetrievalStatus) => {
    const phase = statusPart.phase;
    const message = statusPart.message;
    const tookMs = phase === "done" ? statusPart.tookMs : undefined;
    const resultsCount = phase === "done" ? statusPart.resultsCount : undefined;

    const isLoading =
      phase === "deciding" || phase === "retrieving" || phase === "reranking";
    let label = "Retrieval";
    if (phase === "deciding") label = "Retrieval: deciding";
    if (phase === "retrieving") label = "Retrieval: searching";
    if (phase === "reranking") label = "Retrieval: reranking";
    if (phase === "skipped") label = "Retrieval: skipped";
    if (phase === "done") label = "Retrieval: done";
    if (phase === "error") label = "Retrieval: error";

    const details =
      phase === "done"
        ? `${resultsCount ?? 0} source${(resultsCount ?? 0) === 1 ? "" : "s"}${typeof tookMs === "number" ? ` • ${tookMs}ms` : ""}`
        : undefined;

    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {isLoading && <Loader2Icon className="size-3.5 animate-spin" />}
        <span className="font-medium">{label}</span>
        {details && <span>{details}</span>}
        {message && <span className="truncate">{message}</span>}
      </div>
    );
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
        <CollapsibleContent
          forceMount
          className="flex h-full overflow-hidden transition-[width] duration-200 ease-out data-[state=closed]:w-0 data-[state=closed]:border-r-0 data-[state=open]:w-72"
        >
          <div className="flex h-full w-72 flex-col border-r bg-muted/30">
            <div className="flex items-center justify-between px-3 py-3">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Chat History
              </span>
            </div>
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-1 p-2">
                {isChatLoading ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    Loading chats...
                  </div>
                ) : chats.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    No chats yet.
                  </div>
                ) : (
                  chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                        chat.id === activeChatId
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectChat(chat.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelectChat(chat.id);
                        }
                      }}
                    >
                      <span className="truncate">
                        {chat.title || getDefaultChatTitle()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setChatToDelete(chat);
                        }}
                      >
                        <Trash2Icon className="size-4" />
                        <span className="sr-only">Delete chat</span>
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>

        <div className="flex min-w-0 flex-1 flex-col">
          <Conversation className="flex-1">
            <ConversationContent>
              {messages.map((message) => {
                const attachments = getAttachments(message);
                const copyableText = getCopyableText(message);
                const isLastMessage =
                  message.id === messages[messages.length - 1]?.id;
                const showRetrievalStatusInThisMessage =
                  Boolean(retrievalStatus) &&
                  status !== "ready" &&
                  message.role === "assistant" &&
                  isLastMessage;
                const isLastAssistantMessage =
                  isLastMessage && message.role === "assistant";
                const retrievalResultsPart = message.parts?.find?.(
                  (part) => part.type === "data-retrievalResults",
                ) as { data?: RetrievalResult[] } | undefined;
                const retrievalResults = retrievalResultsPart?.data;
                const sourcesAreOpen =
                  Boolean(retrievalResults?.length) &&
                  Boolean(sourcesOpenByMessageId[message.id]);
                const showRetrievalResultsCarousel =
                  message.role === "assistant" &&
                  Boolean(retrievalResults?.length) &&
                  (!isLastAssistantMessage || status === "ready") &&
                  sourcesAreOpen;
                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent
                      className={
                        showRetrievalResultsCarousel
                          ? "w-full max-w-full min-w-0"
                          : undefined
                      }
                    >
                      {message.parts ? (
                        message.parts.map((part, index) => {
                          if (part.type === "data-retrievalResults") return null;
                          if (part.type === "text") {
                            return (
                              <MessageResponse key={index}>
                                {part.text}
                              </MessageResponse>
                            );
                          }
                          if (part.type === "reasoning") {
                            return (
                              <Reasoning
                                key={index}
                                isStreaming={
                                  status === "streaming" &&
                                  index === message.parts.length - 1 &&
                                  message.id === messages[messages.length - 1].id
                                }
                              >
                                <ReasoningTrigger />
                                <ReasoningContent>{part.text}</ReasoningContent>
                              </Reasoning>
                            );
                          }
                          return null;
                        })
                      ) : (
                        <MessageResponse>
                          {getMessageText(message)}
                        </MessageResponse>
                      )}
                      {attachments.length > 0 && (
                        <MessageAttachments className="mt-2">
                          {attachments.map(
                            (attachment: FileUIPart, index: number) => (
                              <MessageAttachment data={attachment} key={index} />
                            ),
                          )}
                        </MessageAttachments>
                      )}
                      {message.role === "assistant" &&
                        showRetrievalResultsCarousel &&
                        retrievalResults && (
                          <div className="mt-3">
                            <RetrievalResultsCarousel results={retrievalResults} />
                          </div>
                        )}
                      {showRetrievalStatusInThisMessage && retrievalStatus && (
                        <div className="mt-2">
                          {renderRetrievalStatus(retrievalStatus)}
                        </div>
                      )}
                      {message.role === "assistant" &&
                        copyableText &&
                        status === "ready" && (
                          <div className="flex items-center gap-2 ml-auto">
                            {retrievalResults?.length ? (
                              <Button
                                variant="noShadow"
                                size="sm"
                                className="h-8 px-2"
                                type="button"
                                onClick={() =>
                                  setSourcesOpenByMessageId((prev) => ({
                                    ...prev,
                                    [message.id]: !prev[message.id],
                                  }))
                                }
                              >
                                {sourcesOpenByMessageId[message.id]
                                  ? "Hide Sources"
                                  : "Show sources"}
                              </Button>
                            ) : null}
                            <SpeakMessage text={copyableText} />
                            <CopyMessage
                              messageId={message.id}
                              copyableText={copyableText}
                              copiedMessageId={copiedMessageId}
                              setCopiedMessageId={setCopiedMessageId}
                              className=""
                            />
                          </div>
                        )}
                    </MessageContent>
                  </Message>
                );
              })}
              {retrievalStatus &&
                status !== "ready" &&
                messages[messages.length - 1]?.role !== "assistant" && (
                  <Message from="assistant">
                    <MessageContent>
                      <div className="mt-2">
                        {renderRetrievalStatus(retrievalStatus)}
                      </div>
                    </MessageContent>
                  </Message>
                )}
              {error && (
                <div className="mx-4 my-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  Error: {error.message}
                </div>
              )}
              {messages.length === 0 && !error && (
                <ConversationEmptyState
                  title="Start a conversation"
                  description="Chat with the local AI model"
                />
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-t bg-background p-4">
            <div ref={promptAreaRef}>
              <PromptInput
                accept="image/*"
                onSubmit={(message) => {
                  if (!activeChatId || isChatLoading) return;
                  setRetrievalStatus(null);
                  const trimmedText = message.text.trim();
                  const hasFiles = message.files.length > 0;

                  if (!trimmedText && !hasFiles) return; // avoid sending empty messages

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
              >
                <PromptInputHeader className="w-full items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="noShadow"
                      size="sm"
                      className="h-8 gap-2 px-2"
                      onClick={handleNewChat}
                      disabled={
                        status !== "ready" || isChatLoading || !activeChatId
                      }
                      type="button"
                    >
                      <PlusIcon className="size-4" />
                      New Chat
                    </Button>
                    <Button
                      variant="noShadow"
                      size="sm"
                      className="h-8 gap-2 px-2"
                      onClick={() => setIsHistoryOpen((prev) => !prev)}
                      type="button"
                    >
                      <PanelLeftIcon className="size-4" />
                      Chat History
                    </Button>
                  </div>
                </PromptInputHeader>
                <PromptInputAttachments>
                  {(attachment) => <PromptInputAttachment data={attachment} />}
                </PromptInputAttachments>
                <PromptInputTextarea
                  value={input}
                  onChange={handleInputChange}
                  disabled={
                    status !== "ready" || isChatLoading || !activeChatId
                  }
                />
                <PromptInputFooter>
                  <VoiceInput
                    onTranscription={(text) =>
                      setInput((prev) => prev + (prev ? " " : "") + text)
                    }
                  >
                    {({ startRecording }) => (
                      <>
                        <PromptInputTools>
                          <PromptInputActionMenu>
                            <PromptInputActionMenuTrigger variant={"noShadow"}>
                              <Paperclip className="size-4" />
                            </PromptInputActionMenuTrigger>
                            <PromptInputActionMenuContent>
                              <PromptInputActionAddAttachments label="Attach Photos" />
                            </PromptInputActionMenuContent>
                          </PromptInputActionMenu>
                          <LocalModelSelector
                            value={selectedModel}
                            onValueChange={setSelectedModel}
                          />
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="noShadow"
                                  size="sm"
                                  className="h-8 gap-2 px-2"
                                  onClick={() => setAutoSpeak(!autoSpeak)}
                                  disabled={!isSpeechAvailable}
                                  type="button"
                                >
                                  {autoSpeak ? (
                                    <Volume2 className="size-4" />
                                  ) : (
                                    <VolumeX className="size-4 text-muted-foreground" />
                                  )}
                                  <span className="hidden sm:inline">
                                    {autoSpeak
                                      ? "Auto-Speak On"
                                      : "Auto-Speak Off"}
                                  </span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {!isSpeechAvailable
                                    ? "Download Speech model to enable auto-speak"
                                    : autoSpeak
                                      ? "Disable Auto-Speak"
                                      : "Enable Auto-Speak"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </PromptInputTools>
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span tabIndex={-1}>
                                  <Button
                                    variant="noShadow"
                                    size="icon"
                                    className="size-8"
                                    onClick={startRecording}
                                    disabled={!isWhisperAvailable}
                                    type="button"
                                  >
                                    <MicIcon className="size-4" />
                                    <span className="sr-only">Voice Input</span>
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {!isWhisperAvailable && (
                                <TooltipContent>
                                  <p>
                                    Download Whisper model to enable voice input
                                  </p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                          <PromptInputSubmit
                            variant={"noShadow"}
                            status={status}
                            disabled={!activeChatId || isChatLoading}
                            onClick={(e) => {
                              if (status === "streaming") {
                                e.preventDefault();
                                stopChat();
                              }
                            }}
                          />
                        </div>
                      </>
                    )}
                  </VoiceInput>
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </div>
      </Collapsible>

      <Dialog
        open={Boolean(chatToDelete)}
        onOpenChange={(open) => {
          if (!open) setChatToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              This will remove the chat and its messages. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setChatToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              type="button"
              onClick={confirmDeleteChat}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
