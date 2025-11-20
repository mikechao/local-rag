import { createFileRoute } from '@tanstack/react-router'
import { ModelDownload } from '@/components/ModelDownload'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto flex max-w-5xl items-center justify-center">
        <ModelDownload />
      </div>
    </main>
  )
}
