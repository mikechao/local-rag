import type { ChatStatus } from "ai";
import {
  MicIcon,
  Paperclip,
  PanelLeftIcon,
  PlusIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { LocalModelSelector } from "@/components/LocalModelSelector";
import {
  Context,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { VoiceInput } from "@/components/chat/VoiceInput";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  type PromptInputProps,
} from "@/components/ai-elements/prompt-input";

type ChatComposerProps = {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: PromptInputProps["onSubmit"];
  onNewChat: () => void | Promise<void>;
  onToggleHistory: () => void;
  status: ChatStatus;
  isChatLoading: boolean;
  activeChatId: string | null;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  autoSpeak: boolean;
  setAutoSpeak: (value: boolean) => void;
  isSpeechAvailable: boolean;
  isWhisperAvailable: boolean;
  latestModelUsage: { usedTokens: number; maxTokens: number } | null;
  promptAreaRef: React.RefObject<HTMLDivElement | null>;
  onStopChat: () => void;
  quotaOverflow?: boolean;
};

export function ChatComposer({
  input,
  setInput,
  onInputChange,
  onSubmit,
  onNewChat,
  onToggleHistory,
  status,
  isChatLoading,
  activeChatId,
  selectedModel,
  setSelectedModel,
  autoSpeak,
  setAutoSpeak,
  isSpeechAvailable,
  isWhisperAvailable,
  latestModelUsage,
  promptAreaRef,
  onStopChat,
  quotaOverflow = false,
}: ChatComposerProps) {
  return (
    <div className="border-t bg-background p-4">
      <div ref={promptAreaRef}>
        <PromptInput accept="image/*" onSubmit={onSubmit}>
          <PromptInputHeader className="w-full items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="noShadow"
                size="sm"
                className="h-8 gap-2 px-2"
                onClick={onNewChat}
                disabled={
                  status !== "ready" ||
                  isChatLoading ||
                  !activeChatId ||
                  quotaOverflow
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
                onClick={onToggleHistory}
                type="button"
              >
                <PanelLeftIcon className="size-4" />
                Chat History
              </Button>
            </div>
            {latestModelUsage ? (
              <Context
                usedTokens={latestModelUsage.usedTokens}
                maxTokens={latestModelUsage.maxTokens}
              >
                <ContextTrigger />
                <ContextContent>
                  <ContextContentHeader />
                  <ContextContentBody className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Input</span>
                      <span>
                        {latestModelUsage.usedTokens.toLocaleString("en-US")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Quota</span>
                      <span>
                        {latestModelUsage.maxTokens.toLocaleString("en-US")}
                      </span>
                    </div>
                  </ContextContentBody>
                </ContextContent>
              </Context>
            ) : null}
          </PromptInputHeader>
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea
            value={input}
            onChange={onInputChange}
            disabled={
              status !== "ready" ||
              isChatLoading ||
              !activeChatId ||
              quotaOverflow
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
                      <PromptInputActionMenuTrigger
                        variant={"noShadow"}
                        disabled={quotaOverflow}
                      >
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
                              {autoSpeak ? "Auto-Speak On" : "Auto-Speak Off"}
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
                              disabled={!isWhisperAvailable || quotaOverflow}
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
                    <PromptInputSubmit
                      variant={"noShadow"}
                      status={status}
                      disabled={!activeChatId || isChatLoading || quotaOverflow}
                      onClick={(event) => {
                        if (status === "streaming") {
                          event.preventDefault();
                          onStopChat();
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
  );
}
