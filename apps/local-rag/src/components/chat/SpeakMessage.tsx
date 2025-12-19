import { useState, useEffect } from "react";
import {
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import { MegaphoneIcon, Loader2Icon } from "lucide-react";
import {
  generateSpeech,
  isSpeechModelReadyFlag,
  hasCachedSpeechWeights,
} from "@/lib/models/speechModel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";

type SpeakMessageProps = {
  text: string;
  className?: string;
};

export function SpeakMessage({ text, className = "" }: SpeakMessageProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      const ready = isSpeechModelReadyFlag();
      if (ready) {
        setIsAvailable(true);
      } else {
        const cached = await hasCachedSpeechWeights();
        setIsAvailable(cached);
      }
    };
    checkAvailability();
  }, []);

  const handleSpeak = async () => {
    if (isGenerating) return;

    try {
      setIsGenerating(true);

      const before = performance.now();
      const blob = await generateSpeech(text);
      const after = performance.now();
      console.log(`Speech generation took ${(after - before).toFixed(2)} ms`);

      const url = URL.createObjectURL(blob);

      const audioEl = new Audio(url);

      audioEl.onended = () => {
        URL.revokeObjectURL(url);
        setIsGenerating(false);
      };

      audioEl.onerror = (e) => {
        console.error("Audio playback error:", e);
        URL.revokeObjectURL(url);
        setIsGenerating(false);
      };

      await audioEl.play();
    } catch (error) {
      console.error("Failed to generate speech:", error);
      setIsGenerating(false);
    }
  };

  if (!isAvailable) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={className}>
              <MessageActions>
                <MessageAction
                  aria-label="Speech model not available"
                  label="Speak message"
                  disabled
                >
                  <MegaphoneIcon className="size-4 opacity-50" />
                </MessageAction>
              </MessageActions>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              Speech model not available.{" "}
              <Link to="/models" className="underline">
                Download it here
              </Link>
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <MessageActions className={className}>
      <MessageAction
        aria-label="Speak message"
        label="Speak message"
        tooltip="Speak message"
        onClick={handleSpeak}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <MegaphoneIcon className="size-4" />
        )}
      </MessageAction>
    </MessageActions>
  );
}
