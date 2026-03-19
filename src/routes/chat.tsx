import { createFileRoute } from "@tanstack/react-router";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { PageContainer } from "@/components/PageContainer";

export const Route = createFileRoute("/chat")({ component: ChatPage });

function ChatPage() {
  return (
    <PageContainer
      label="Chat"
      title="Chat with the AI Agent"
      description="Ask about the documents you have uploaded or anything else"
    >
      <ChatInterface />
    </PageContainer>
  );
}
