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
} from "@/components/ai-elements/prompt-input";
import { builtInAI } from "@built-in-ai/core";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export function ChatInterface() {
  const [isModelAvailable, setIsModelAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const model = builtInAI();
        const availability = await model.availability();
        setIsModelAvailable(availability === "available");
      } catch (error) {
        console.error("Failed to check model availability:", error);
        setIsModelAvailable(false);
      }
    };
    checkAvailability();
  }, []);

  const [input, setInput] = useState("");
  
  const { messages, sendMessage } = useChat({
    transport: new ClientSideChatTransport(),
    id: "local-chat",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

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
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                <MessageResponse>{getMessageText(message)}</MessageResponse>
              </MessageContent>
            </Message>
          ))}
          {messages.length === 0 && (
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
            const parts = [
              { type: 'text', text: message.text },
              ...message.files.map(file => ({
                type: 'file',
                url: file.url,
                mimeType: file.mediaType,
              })),
            ];

            sendMessage({
              role: 'user',
              // @ts-ignore - parts is the v5 way
              parts: parts,
            });
            setInput("");
          }}
        >
          <PromptInputTextarea 
            value={input}
            onChange={handleInputChange}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
