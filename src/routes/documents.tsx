import { createFileRoute } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/documents")({
	component: DocumentsPage,
});

function DocumentsPage() {
	return (
		<div className="mx-auto max-w-5xl space-y-6">
			<div className="space-y-2">
				<p className="text-sm font-semibold tracking-wide text-main">Documents</p>
				<h1 className="text-3xl font-heading">Upload or view documents in the RAG system</h1>
				<p className="text-foreground/80">
					Manage source files for retrieval: add markdown, PDFs, and more. Document ingestion UI is coming soon.
				</p>
			</div>
			<Separator />
		</div>
	);
}
