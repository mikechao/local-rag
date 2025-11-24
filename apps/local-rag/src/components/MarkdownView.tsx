import Markdown from "react-markdown";

interface MarkdownViewProps {
	content: string;
}

export function MarkdownView({ content }: MarkdownViewProps) {
	return (
		<div className="prose prose-sm dark:prose-invert max-w-none p-4">
			<Markdown>{content}</Markdown>
		</div>
	);
}
