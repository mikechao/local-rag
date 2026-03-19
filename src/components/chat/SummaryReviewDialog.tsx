import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface SummaryReviewDialogProps {
  open: boolean;
  summary: string;
  onSummaryChange: (value: string) => void;
  onRegenerate: () => void;
  onProceed: () => void;
  onDismiss: () => void;
}

export function SummaryReviewDialog({
  open,
  summary,
  onSummaryChange,
  onRegenerate,
  onProceed,
  onDismiss,
}: SummaryReviewDialogProps) {
  const isProceedDisabled = !summary.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onDismiss();
      }}
    >
      <DialogContent
        className="max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Review Summary</DialogTitle>
          <DialogDescription>
            Review and edit the summary before starting a new chat.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={summary}
          onChange={(e) => onSummaryChange(e.target.value)}
          placeholder="Edit summary before proceeding..."
          className="min-h-[200px] resize-none"
        />
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={onRegenerate}
            className="w-full sm:w-auto"
          >
            Regenerate Summary
          </Button>
          <Button
            onClick={onProceed}
            disabled={isProceedDisabled}
            className="w-full sm:w-auto"
          >
            Proceed with Summary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
