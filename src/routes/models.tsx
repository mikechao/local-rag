import { createFileRoute } from "@tanstack/react-router"

import { ModelDownload } from "@/components/ModelDownload"

export const Route = createFileRoute("/models")({ component: ModelsPage })

function ModelsPage() {
  return (
    <div className="mx-auto flex max-w-5xl items-center justify-center">
      <ModelDownload />
    </div>
  )
}
