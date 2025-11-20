import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/chat")({ component: ChatPage })

function ChatPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-main">Chat</p>
        <h1 className="text-3xl font-heading">Chat coming soon</h1>
        <p className="text-foreground/80">
          We&apos;re preparing the chat experience. In the meantime, you can download models from the
          Models tab.
        </p>
      </div>
    </div>
  )
}
