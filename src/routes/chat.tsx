import { createFileRoute } from "@tanstack/react-router"
import { PageContainer } from "@/components/PageContainer"

export const Route = createFileRoute("/chat")({ component: ChatPage })

function ChatPage() {
  return (
    <PageContainer
      label="Chat"
      title="Chat with the AI Agent"
      description="Ask about the documents you have uploaded or anything else"
    >
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Chat coming soon</h2>
        <p className="text-foreground/80">
          We&apos;re preparing the chat experience. In the meantime, you can download models from the
          Models tab.
        </p>
      </div>
    </PageContainer>
  )
}
