import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const pdfOptions = {
	cMapUrl: "/cmaps/",
	cMapPacked: true,
};

interface PdfViewProps {
	url: string;
}

export function PdfView({ url }: PdfViewProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pageNumber, setPageNumber] = useState<number>(1);

	function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
		setNumPages(numPages);
	}

	function onDocumentLoadError(error: Error) {
		console.error("Error loading PDF:", error);
	}

	return (
		<div className="flex flex-col items-center gap-4 p-4">
			<Document
				file={url}
				options={pdfOptions}
				onLoadSuccess={onDocumentLoadSuccess}
				onLoadError={onDocumentLoadError}
				className="max-w-full"
				loading={<div className="p-4">Loading PDF...</div>}
				error={<div className="p-4 text-red-500">Failed to load PDF.</div>}
			>
				<Page
					pageNumber={pageNumber}
					renderTextLayer={false}
					renderAnnotationLayer={false}
					className="shadow-md"
					width={600}
				/>
			</Document>
			{numPages > 1 && (
				<div className="flex items-center gap-4">
					<Button
						variant="neutral"
						size="icon"
						disabled={pageNumber <= 1}
						onClick={() => setPageNumber((prev) => prev - 1)}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-sm">
						Page {pageNumber} of {numPages}
					</span>
					<Button
						variant="neutral"
						size="icon"
						disabled={pageNumber >= numPages}
						onClick={() => setPageNumber((prev) => prev + 1)}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
