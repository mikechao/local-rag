import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChatSummary } from "@/lib/chat-storage";

type DeleteChatDialogProps = {
  chatToDelete: ChatSummary | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteChatDialog({
  chatToDelete,
  onCancel,
  onConfirm,
}: DeleteChatDialogProps) {
  return (
    <Dialog
      open={Boolean(chatToDelete)}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete chat?</DialogTitle>
          <DialogDescription>
            This will remove the chat and its messages. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
            type="button"
            onClick={onConfirm}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
