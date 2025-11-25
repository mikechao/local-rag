import { useEffect, useState } from "react";
import { useVoiceVisualizer, VoiceVisualizer } from "react-voice-visualizer";
import { Button } from "@/components/ui/button";
import { Loader2Icon, SquareIcon } from "lucide-react";
import { experimental_transcribe as transcribe } from "ai";
import { getWhisperModel } from "@/lib/whisperModel";

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  children: (props: { startRecording: () => void }) => React.ReactNode;
}

export function VoiceInput({ onTranscription, children }: VoiceInputProps) {
  const controls = useVoiceVisualizer();
  const { isRecordingInProgress, isPausedRecording, formattedRecordingTime, recordedBlob } = controls;
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    if (recordedBlob) {
      handleTranscription(recordedBlob);
    }
  }, [recordedBlob]);

  const handleTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      
      const transcript = await transcribe({
        model: getWhisperModel(),
        audio: arrayBuffer,
      });

      if (transcript.text) {
        onTranscription(transcript.text);
      }
    } catch (error) {
      console.error("Transcription error:", error);
    } finally {
      setIsTranscribing(false);
      controls.clearCanvas();
    }
  };

  const handleStartRecording = () => {
    controls.startRecording();
  };

  const handleStopRecording = () => {
    controls.stopRecording();
  };

  if (isTranscribing) {
    return (
      <div className="flex w-full items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span>Transcribing audio...</span>
      </div>
    );
  }

  if (isRecordingInProgress || isPausedRecording) {
    return (
      <div className="flex w-full items-center gap-2">
        <div className="flex-1 overflow-hidden rounded-md border bg-background/50">
            <VoiceVisualizer 
                controls={controls} 
                height={40}
                width="100%"
                mainBarColor="currentColor"
                secondaryBarColor="currentColor"
                barWidth={3}
                gap={2}
                isControlPanelShown={false}
            />
        </div>
        <div className="flex items-center gap-1">
            <span className="text-xs font-mono w-12 text-center">
                {formattedRecordingTime}
            </span>
            <Button
            variant="neutral"
            size="icon"
            className="size-8"
            onClick={handleStopRecording}
            title="Stop and Transcribe"
            >
            <SquareIcon className="size-4" />
            </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children({ startRecording: handleStartRecording })}
    </>
  );
}
