import { useChat } from "@ai-sdk/react";
import { ClientSideChatTransport } from "@/lib/client-side-chat-transport";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAttachments,
  MessageAttachment,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputSubmit,
  PromptInputAttachments,
  PromptInputAttachment,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertCircle, Paperclip, MicIcon } from "lucide-react";
import { CopyMessage } from "@/components/CopyMessage";
import { LocalModelSelector } from "@/components/LocalModelSelector";
import { VoiceInput } from "@/components/VoiceInput";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hasCachedWhisperWeights } from "@/lib/models/whisperModel";

export function ChatInterface() {
  const [isModelAvailable] = useState<boolean | null>(true);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-nano");
  const [isWhisperAvailable, setIsWhisperAvailable] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  useEffect(() => {
    const checkWhisper = async () => {
      const isCached = await hasCachedWhisperWeights();
      setIsWhisperAvailable(isCached);
    };
    checkWhisper();
  }, []);

  const [input, setInput] = useState("");
  
  const { messages, sendMessage, error, status } = useChat({
    transport: new ClientSideChatTransport(),
    id: "local-chat",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const stripThinking = (text: string) =>
    text.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();

  const getMessageText = (message: any) => {
    if (message.content) return message.content;
    if (message.parts) {
      return message.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('');
    }
    return '';
  };

  const getCopyableText = (message: any) => {
    if (message.parts) {
      return message.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => stripThinking(part.text))
        .filter(Boolean)
        .join("\n\n");
    }

    return stripThinking(getMessageText(message));
  };

  const getAttachments = (message: any) => {
    if (!message.parts) return [];
    return message.parts
      .filter((part: any) => part.type === 'file' || part.type === 'image')
      .map((part: any) => {
        if (part.type === 'file') {
           return {
             ...part,
             url: part.url || (part.data ? `data:${part.mimeType || part.mediaType};base64,${part.data}` : ''),
             mediaType: part.mimeType || part.mediaType,
             filename: part.filename || 'Image'
           };
        }
        if (part.type === 'image') {
           return {
             ...part,
             url: part.url || (part.image ? `data:${part.mimeType};base64,${part.image}` : ''),
             mediaType: part.mimeType || 'image/jpeg',
             filename: 'Image'
           };
        }
        return part;
      });
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
    <div className="flex h-[calc(100vh-14rem)] flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.map((message) => {
            const attachments = getAttachments(message);
            const copyableText = getCopyableText(message);
            return (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts ? (
                    message.parts.map((part, index) => {
                      if (part.type === "text") {
                      const thinkMatch = part.text.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
                      if (thinkMatch) {
                        const reasoning = thinkMatch[1];
                        const hasFinishedThinking = part.text.includes("</think>");
                        const content = part.text.replace(/<think>[\s\S]*?(?:<\/think>|$)/, "").trim();
                        
                        return (
                          <div key={index} className="flex flex-col gap-2">
                            <Reasoning
                              isStreaming={
                                status === "streaming" &&
                                index === message.parts.length - 1 &&
                                message.id === messages[messages.length - 1].id &&
                                !hasFinishedThinking
                              }
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>{reasoning}</ReasoningContent>
                            </Reasoning>
                            {content && <MessageResponse>{content}</MessageResponse>}
                          </div>
                        );
                      }
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
                      {attachments.map((attachment: any, index: number) => (
                        <MessageAttachment data={attachment} key={index} />
                      ))}
                    </MessageAttachments>
                  )}
                  {message.role === "assistant" && copyableText && status === "ready" && (
                    <CopyMessage
                      messageId={message.id}
                      copyableText={copyableText}
                      copiedMessageId={copiedMessageId}
                      setCopiedMessageId={setCopiedMessageId}
                    />
                  )}
              </MessageContent>
            </Message>
            );
          })}
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
        <PromptInput
          accept="image/*"
          onSubmit={(message) => {
            const trimmedText = message.text.trim();
            const parts = [
              ...(trimmedText ? [{ type: "text", text: trimmedText }] : []),
              ...message.files.map((file) => ({
                type: "file",
                data: file.url.toString().split(",")[1],
                mediaType: file.mediaType,
              })),
            ];

            if (parts.length === 0) return; // avoid sending empty messages

            sendMessage(
              {
                role: "user",
                // @ts-ignore - parts is the v5 way
                parts: parts,
              },
              {
                body: { modelId: selectedModel },
              },
            );
            setInput("");
          }}
        >
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea 
            value={input}
            onChange={handleInputChange}
          />
          <PromptInputFooter>
            <VoiceInput 
              onTranscription={(text) => setInput(prev => prev + (prev ? " " : "") + text)}
            >
              {({ startRecording }) => (
                <>
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger variant={"noShadow"}>
                        <Paperclip className="size-4" />
                      </PromptInputActionMenuTrigger>
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments label="Attach Photos"/>
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                    <LocalModelSelector
                      value={selectedModel}
                      onValueChange={setSelectedModel}
                    />
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
                            <p>Download Whisper model to enable voice input</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                    <PromptInputSubmit  variant={"noShadow"}/>
                  </div>
                </>
              )}
            </VoiceInput>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
