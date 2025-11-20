import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/documents")({ component: DocumentsPage })

function DocumentsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-main">Documents</p>
        <h1 className="text-3xl font-heading">Documents coming soon</h1>
        <p className="text-foreground/80">
          We&apos;re building document management. Check back soon, or jump to the Models tab to set
          up embeddings.
        </p>
      </div>
    </div>
  )
}
