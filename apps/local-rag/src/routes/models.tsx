import { createFileRoute } from "@tanstack/react-router"

import { EmbeddingModelDownload } from "@/components/model-download/EmbeddingModelDownload"
import { GeminiNanoDownload } from "@/components/model-download/GeminiNanoDownload"
import { MistralDownload } from "@/components/model-download/MistralDownload"
import { WhisperDownload } from "@/components/model-download/WhisperDownload"
import { SpeechDownload } from "@/components/model-download/SpeechDownload"
import { PageContainer } from "@/components/PageContainer"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const Route = createFileRoute("/models")({ component: ModelsPage })

function ModelsPage() {
  return (
    <PageContainer
      label="Models"
      title="Local Models"
      description="Manage various local AI Models used for embedding and LLM tasks."
    >
      <div className="mx-auto flex w-full flex-col gap-4 items-center justify-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl">Chat Models</CardTitle>
            <CardDescription>
              On-device models used to power chat. All models are cached after download.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid w-full gap-4 md:grid-cols-2">
            <GeminiNanoDownload />
            <MistralDownload />
          </CardContent>
        </Card>
        <EmbeddingModelDownload />
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl">Speech Models</CardTitle>
            <CardDescription>
              On-device models used to power speech recognition and synthesis
            </CardDescription>
          </CardHeader>
          <CardContent className="grid w-full gap-4 md:grid-cols-2">
            <WhisperDownload />
            <SpeechDownload />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
