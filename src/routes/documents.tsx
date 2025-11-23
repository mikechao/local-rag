import { createFileRoute } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useRef } from "react";
import { useDocumentUpload } from "@/hooks/use-document-upload";

export const Route = createFileRoute("/documents")({
	component: DocumentsPage,
});

function DocumentsPage() {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const { upload, status } = useDocumentUpload();

	const handlePickFile = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		void upload(file);
		// reset so selecting the same file twice still triggers change
		event.target.value = "";
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6">
			<div className="space-y-2">
				<p className="text-sm font-semibold tracking-wide text-main">Documents</p>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<h1 className="text-3xl font-heading">Upload or view documents in the RAG system</h1>
						<p className="text-foreground/80">
							Manage source files for retrieval: add markdown, PDFs, and more. Document ingestion UI is coming soon.
						</p>
					</div>
				</div>
				<p className="text-foreground/80">
					Uploads currently support Markdown (.md) and PDF files. Progress and cancel controls will appear in a toast.
				</p>
			</div>
			<div className="flex items-center gap-3">
				<input
					ref={fileInputRef}
					type="file"
					accept=".md,.markdown,.pdf,application/pdf,text/markdown"
					className="hidden"
					onChange={handleFileChange}
				/>
				<Button onClick={handlePickFile} disabled={status === "uploading"}>
					<Upload className="h-4 w-4" />
					Upload
				</Button>
			</div>
			<Separator />
		</div>
	);
}
