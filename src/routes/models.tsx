import { createFileRoute } from "@tanstack/react-router"

import { EmbeddingGemmaDownload } from "@/components/EmbeddingGemmaDownload"

export const Route = createFileRoute("/models")({ component: ModelsPage })

function ModelsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4">
      <EmbeddingGemmaDownload />
    </div>
  )
}
