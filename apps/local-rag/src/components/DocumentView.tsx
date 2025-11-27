import { useEffect, useMemo, useState } from "react";
import { pdfjs } from "react-pdf";
import { fetchPdfRange, getDocumentObjectUrl, initPdfStream } from "@/lib/doc-storage";
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
	const [rangeFile, setRangeFile] = useState<{ range: pdfjs.PDFDataRangeTransport } | null>(
		null,
	);
	const pdfFile = useMemo(() => {
		if (rangeFile) return rangeFile
		if (url) return url
		return null
	}, [rangeFile, url])

	useEffect(() => {
		let active = true;
		let revoke: (() => void) | null = null;

		async function load() {
			try {
				setLoading(true);
				const streamMeta = await initPdfStream(docId);
				if (!active) return;
				setMime(streamMeta.mime);
				if (streamMeta.mime === "application/pdf") {
					const transport = new pdfjs.PDFDataRangeTransport(streamMeta.size, new Uint8Array());
					transport.requestDataRange = async (begin: number, end: number) => {
						try {
							const result = await fetchPdfRange(docId, begin, end);
							transport.onDataRange(result.begin ?? begin, result.data);
						} catch (_err) {
							transport.abort();
						}
					};
					setRangeFile({ range: transport });
					revoke = null;
				} else {
					const result = await getDocumentObjectUrl(docId);
					if (!active) {
						result.revoke();
						return;
					}
					revoke = result.revoke;
					setUrl(result.url);

					if (
						result.mime === "text/markdown" ||
						result.mime === "text/plain" ||
						result.filename.endsWith(".md")
					) {
						const text = await result.blob.text();
						if (active) setContent(text);
					}
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

	if (mime === "application/pdf" && (rangeFile || url)) {
		return (
			<div className="h-[80vh] w-full overflow-y-auto">
				{pdfFile && <PdfView file={pdfFile} />}
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
