import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SummaryLoaddingDialogProps {
  open: boolean;
}

export function SummaryLoaddingDialog({ open }: SummaryLoaddingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Summarizing...</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
