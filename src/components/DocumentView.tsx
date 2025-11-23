import { useEffect, useState } from "react";
import { getDocumentObjectUrl } from "@/lib/doc-storage";
import { MarkdownView } from "./MarkdownView";
import { PdfView } from "./PdfView";
import { Spinner } from "@/components/ui/shadcn-io/spinner";

interface DocumentViewProps {
	docId: string;
}

export function DocumentView({ docId }: DocumentViewProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [content, setContent] = useState<string | null>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [mime, setMime] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		let revoke: (() => void) | null = null;

		async function load() {
			try {
				setLoading(true);
				const result = await getDocumentObjectUrl(docId);
				if (!active) {
					result.revoke();
					return;
				}
				revoke = result.revoke;
				setMime(result.mime);
				setUrl(result.url);

				if (
					result.mime === "text/markdown" ||
					result.mime === "text/plain" ||
					result.filename.endsWith(".md")
				) {
					const text = await result.blob.text();
					if (active) setContent(text);
				}
			} catch (err) {
				if (active) {
					setError(err instanceof Error ? err.message : String(err));
				}
			} finally {
				if (active) setLoading(false);
			}
		}

		void load();

		return () => {
			active = false;
			if (revoke) revoke();
		};
	}, [docId]);

	if (loading) {
		return (
			<div className="flex h-64 w-full items-center justify-center">
				<Spinner size={32} />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-64 w-full items-center justify-center text-destructive">
				Error: {error}
			</div>
		);
	}

	if (mime === "application/pdf" && url) {
		return (
			<div className="h-[80vh] w-full overflow-y-auto">
				<PdfView url={url} />
			</div>
		);
	}

	if (content) {
		return (
			<div className="h-[80vh] w-full overflow-y-auto">
				<MarkdownView content={content} />
			</div>
		);
	}

	return (
		<div className="flex h-64 w-full items-center justify-center text-muted-foreground">
			Unsupported file type: {mime}
		</div>
	);
}
