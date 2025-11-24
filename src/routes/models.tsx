import { createFileRoute } from "@tanstack/react-router"

import { EmbeddingGemmaDownload } from "@/components/EmbeddingGemmaDownload"
import { PageContainer } from "@/components/PageContainer"

export const Route = createFileRoute("/models")({ component: ModelsPage })

function ModelsPage() {
  return (
    <PageContainer
      label="Models"
      title="Local Models"
      description="Manage various local AI Models used for embedding and LLM tasks."
    >
      <div className="mx-auto flex w-full items-center justify-center">
        <EmbeddingGemmaDownload />
      </div>
    </PageContainer>
  )
}
