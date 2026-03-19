import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useEffect, useRef } from "react";
import { DocumentsTable } from "@/components/DocumentsTable";
import { PageContainer } from "@/components/PageContainer";
import { Button } from "@/components/ui/button";
import { useDocumentUpload } from "@/hooks/use-document-upload";
import { useDocuments } from "@/hooks/use-documents";

export const Route = createFileRoute("/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { upload, status } = useDocumentUpload();
  const { data: documents, refresh } = useDocuments();

  useEffect(() => {
    if (status === "success") {
      refresh();
    }
  }, [status, refresh]);

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
    <PageContainer
      label="Documents"
      title="Upload or view documents in the RAG system"
      description={
        <>
          <p>
            Manage source files for retrieval: add markdown, PDFs, and more.
            Document ingestion UI is coming soon.
          </p>
          <p>
            Uploads currently support Markdown (.md) and PDF files. Progress and
            cancel controls will appear in a toast.
          </p>
        </>
      }
      actions={
        <>
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
        </>
      }
    >
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Uploaded Documents</h2>
        <DocumentsTable data={documents} />
      </div>
    </PageContainer>
  );
}
