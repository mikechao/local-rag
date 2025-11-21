import { createFileRoute } from "@tanstack/react-router"

import { ModelDownload } from "@/components/ModelDownload"

export const Route = createFileRoute("/models")({ component: ModelsPage })

function ModelsPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4">
      <ModelDownload />
    </div>
  )
}
