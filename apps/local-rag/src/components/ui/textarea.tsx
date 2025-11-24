import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
	({ className, ...props }, ref) => {
		return (
			<textarea
				className={cn(
					"flex min-h-[120px] w-full rounded-[var(--radius-base)] border border-border bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-main focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-90",
					className,
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);

Textarea.displayName = "Textarea";
