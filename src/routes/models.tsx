import { createFileRoute } from "@tanstack/react-router"

import { Separator } from "@/components/ui/separator"
import { EmbeddingGemmaDownload } from "@/components/EmbeddingGemmaDownload"

export const Route = createFileRoute("/models")({ component: ModelsPage })

function ModelsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-main">Models</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-heading">Local Models</h1>
            <p className="text-foreground/80">
              Manage various local AI Models used for embedding and LLM tasks.
            </p>
          </div>
        </div>
      </div>
      <Separator />
      <div className="mx-auto flex w-full items-center justify-center">
        <EmbeddingGemmaDownload />
      </div>
    </div>
  )
}
