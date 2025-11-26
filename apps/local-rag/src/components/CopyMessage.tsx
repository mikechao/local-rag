import type { Dispatch, SetStateAction } from "react";
import { MessageActions, MessageAction } from "@/components/ai-elements/message";
import { CheckIcon, CopyIcon } from "lucide-react";

type CopyMessageProps = {
	messageId: string;
	copyableText: string;
	copiedMessageId: string | null;
	setCopiedMessageId: Dispatch<SetStateAction<string | null>>;
	className?: string;
};

export function CopyMessage({
	messageId,
	copyableText,
	copiedMessageId,
	setCopiedMessageId,
	className = "ml-auto",
}: CopyMessageProps) {
	return (
		<MessageActions className={className}>
			<MessageAction
				aria-label="Copy message"
				label="Copy message"
				tooltip={copiedMessageId === messageId ? "Copied" : "Copy message"}
				onClick={async () => {
					if (typeof navigator === "undefined" || !navigator.clipboard) return;

					try {
						await navigator.clipboard.writeText(copyableText);
						setCopiedMessageId(messageId);
						setTimeout(() => setCopiedMessageId(null), 2000);
					} catch (err) {
						console.error("Failed to copy message", err);
					}
				}}
			>
				{copiedMessageId === messageId ? (
					<CheckIcon className="size-4" />
				) : (
					<CopyIcon className="size-4" />
				)}
			</MessageAction>
		</MessageActions>
	);
}
