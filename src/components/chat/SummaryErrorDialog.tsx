import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SummaryErrorDialogProps {
  error: string | null;
  onProceedWithoutSummary: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

export function SummaryErrorDialog({
  error,
  onProceedWithoutSummary,
  onRetry,
  onDismiss,
}: SummaryErrorDialogProps) {
  return (
    <Dialog
      open={!!error}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Summarization Failed</DialogTitle>
          <DialogDescription>
            {error || "An error occurred while summarizing the chat."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={onProceedWithoutSummary}
            className="w-full sm:w-auto"
          >
            New Chat Without Summary
          </Button>
          <Button onClick={onRetry} className="w-full sm:w-auto">
            Retry
          </Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground">
          Starting a new chat without summary will lose the conversation
          context.
        </p>
      </DialogContent>
    </Dialog>
  );
}
