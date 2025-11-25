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
import { builtInAI } from "@built-in-ai/core";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertCircle, Paperclip } from "lucide-react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { CheckIcon } from "lucide-react";
import { hasCachedQwenWeights, isQwenModelReadyFlag } from "@/lib/qwenModel";

export function ChatInterface() {
  const [isModelAvailable, setIsModelAvailable] = useState<boolean | null>(null);
  const [isQwenAvailable, setIsQwenAvailable] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-nano");
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

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

    const checkQwen = async () => {
      const cached = await hasCachedQwenWeights();
      const ready = isQwenModelReadyFlag();
      setIsQwenAvailable(cached || ready);
    };
    checkQwen();
  }, []);

  const availableModels = [
    {
      id: "gemini-nano",
      name: "Gemini Nano",
      chef: "Google",
      chefSlug: "google",
      providers: ["google"],
    },
    ...(isQwenAvailable
      ? [
          {
            id: "qwen3-0.6b",
            name: "Qwen3-0.6B",
            chef: "Alibaba",
            chefSlug: "alibaba",
            providers: ["alibaba"],
          },
        ]
      : []),
  ];

  const selectedModelData =
    availableModels.find((m) => m.id === selectedModel) || availableModels[0];
  const chefs = Array.from(new Set(availableModels.map((model) => model.chef)));

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
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                <MessageAttachments className="mb-2">
                  {getAttachments(message).map((attachment: any, index: number) => (
                    <MessageAttachment data={attachment} key={index} />
                  ))}
                </MessageAttachments>
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
              ...message.files.map((file) => ({
                type: "file",
                data: file.url.toString().split(",")[1],
                mediaType: file.mediaType,
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
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea 
            value={input}
            onChange={handleInputChange}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger>
                  <Paperclip className="size-4" />
                </PromptInputActionMenuTrigger>
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments label="Attach Photos"/>
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              <ModelSelector
                open={isModelSelectorOpen}
                onOpenChange={setIsModelSelectorOpen}
              >
                <ModelSelectorTrigger asChild>
                  <Button
                    className="gap-2 pl-2 pr-2 h-8"
                    variant="ghost"
                    size="sm"
                  >
                    <div className="flex items-center gap-2">
                      {selectedModelData?.chefSlug && (
                        <ModelSelectorLogo provider={selectedModelData.chefSlug} />
                      )}
                      {selectedModelData?.name && (
                        <ModelSelectorName>
                          {selectedModelData.name}
                        </ModelSelectorName>
                      )}
                    </div>
                  </Button>
                </ModelSelectorTrigger>
                <ModelSelectorContent className="mb-2">
                  <ModelSelectorInput placeholder="Search models..." />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    {chefs.map((chef) => (
                      <ModelSelectorGroup heading={chef} key={chef}>
                        {availableModels
                          .filter((model) => model.chef === chef)
                          .map((model) => (
                            <ModelSelectorItem
                              key={model.id}
                              onSelect={() => {
                                setSelectedModel(model.id);
                                setIsModelSelectorOpen(false);
                              }}
                              value={model.id}
                            >
                              <ModelSelectorLogo provider={model.chefSlug} />
                              <ModelSelectorName>{model.name}</ModelSelectorName>
                              {selectedModel === model.id ? (
                                <CheckIcon className="ml-auto size-4" />
                              ) : (
                                <div className="ml-auto size-4" />
                              )}
                            </ModelSelectorItem>
                          ))}
                      </ModelSelectorGroup>
                    ))}
                  </ModelSelectorList>
                </ModelSelectorContent>
              </ModelSelector>
            </PromptInputTools>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
