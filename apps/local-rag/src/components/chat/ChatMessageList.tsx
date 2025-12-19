import type { ChatStatus, FileUIPart } from "ai";
import { Loader2Icon } from "lucide-react";
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
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { RetrievalResultsCarousel } from "@/components/RetrievalResultsCarousel";
import { CopyMessage } from "@/components/chat/CopyMessage";
import { SpeakMessage } from "@/components/chat/SpeakMessage";
import { Button } from "@/components/ui/button";
import type { LocalRAGMessage, RetrievalStatus } from "@/lib/local-rag-message";
import type { RetrievalResult } from "@/lib/retrieval";
import {
  getAttachments,
  getCopyableText,
  getMessageText,
} from "./chat-message-utils";

type ChatMessageListProps = {
  messages: LocalRAGMessage[];
  status: ChatStatus;
  retrievalStatus: RetrievalStatus | null;
  sourcesOpenByMessageId: Record<string, boolean>;
  setSourcesOpenByMessageId: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  copiedMessageId: string | null;
  setCopiedMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  error?: Error;
};

export function ChatMessageList({
  messages,
  status,
  retrievalStatus,
  sourcesOpenByMessageId,
  setSourcesOpenByMessageId,
  copiedMessageId,
  setCopiedMessageId,
  error,
}: ChatMessageListProps) {
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

  return (
    <Conversation className="flex-1">
      <ConversationContent>
        {messages.map((message) => {
          const attachments = getAttachments(message);
          const copyableText = getCopyableText(message);
          const isLastMessage = message.id === messages[messages.length - 1]?.id;
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
                        <MessageResponse key={index}>{part.text}</MessageResponse>
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
                  <MessageResponse>{getMessageText(message)}</MessageResponse>
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
  );
}
