import { createFileRoute } from "@tanstack/react-router"

import { EmbeddingGemmaDownload } from "@/components/model-download/EmbeddingGemmaDownload"
import { GeminiNanoDownload } from "@/components/model-download/GeminiNanoDownload"
import { QwenDownload } from "@/components/model-download/QwenDownload"
import { PageContainer } from "@/components/PageContainer"

export const Route = createFileRoute("/models")({ component: ModelsPage })

function ModelsPage() {
  return (
    <PageContainer
      label="Models"
      title="Local Models"
      description="Manage various local AI Models used for embedding and LLM tasks."
    >
      <div className="mx-auto flex w-full flex-col gap-4 items-center justify-center">
        <EmbeddingGemmaDownload />
        <QwenDownload />
        <GeminiNanoDownload />
      </div>
    </PageContainer>
  )
}
