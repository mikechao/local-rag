# Chat Component Implementation Plan

This plan outlines the steps to implement a fully functional chat interface in `src/routes/chat.tsx` using Vercel AI SDK Elements and the `@built-in-ai/core` library.

## Objective
Create a chat interface with:
- Message history display using `Conversation` component.
- Input area using `PromptInput` component.
- File upload capability.
- Integration with browser built-in AI models via `ClientSideChatTransport`.
- Model download progress tracking.

## Prerequisites
- `ai` SDK installed (Confirmed).
- `@built-in-ai/core` installed (Confirmed).
- `use-stick-to-bottom` installed (Confirmed).
- `ClientSideChatTransport` implementation available.

## Step-by-Step Implementation

### 1. Organize and Refactor Utilities
Move the `ClientSideChatTransport` implementation to `src/lib/` and refactor it to remove model downloading logic.

- **Action**: Move `docs/client-side-chat-transport.ts` to `src/lib/client-side-chat-transport.ts`.
- **Refactor**: Remove the `createUIMessageStream` block and the download progress logic. The transport should simply call `streamText` if the model is available, or throw an error if not. The UI will handle directing the user to the download page.

### 2. Create Chat Interface Component (`src/components/ChatInterface.tsx`)

Create a new component `ChatInterface` to encapsulate the chat logic and UI.

#### A. Setup `useChat` Hook
Initialize the `useChat` hook with the custom transport to handle browser-native models.

```typescript
import { useChat } from "ai/react";
import { ClientSideChatTransport } from "@/lib/client-side-chat-transport";

export function ChatInterface() {
  const { messages, input, handleInputChange, handleSubmit, append, data } = useChat({
    transport: new ClientSideChatTransport(),
    id: "local-chat",
  });
  
  // ... implementation
}
```

#### B. Implement Layout
Create a flex column layout that takes up the full height of the page.

- **Top**: `Conversation` component (scrollable area for messages).
- **Bottom**: `PromptInput` component (sticky at the bottom).

#### C. Integrate `Conversation` Component
Use the `Conversation` component to display messages, utilizing the `Message` component from AI Elements for proper styling and markdown rendering.

```tsx
import { 
  Conversation, 
  ConversationContent, 
  ConversationEmptyState, 
  ConversationScrollButton 
} from "@/components/ai-elements/conversation";
import { 
  Message, 
  MessageContent, 
  MessageResponse 
} from "@/components/ai-elements/message";

// ... inside the component
<Conversation>
  <ConversationContent>
    {messages.map((message) => (
      <Message key={message.id} from={message.role}>
        <MessageContent>
          <MessageResponse>{message.content}</MessageResponse>
        </MessageContent>
      </Message>
    ))}
    {messages.length === 0 && (
      <ConversationEmptyState 
        title="Start a conversation" 
        description="Chat with the local AI model" 
      />
    )}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

#### D. Integrate `PromptInput` Component
Use the `PromptInput` component for user input and file uploads.

- Configure `PromptInput` to bind to `input` and `handleInputChange`.
- Handle form submission to call `handleSubmit` or `append`.
- Enable file uploads.

```tsx
<PromptInput
  value={input}
  onChange={handleInputChange}
  accept="image/*"
  onSubmit={(message) => {
    // Handle submission
    // message.text contains the text
    // message.files contains the attachments
    
    // In AI SDK v5, attachments are handled via the `experimental_attachments` replacement: `parts` (or similar structure depending on exact version)
    // However, `append` might expect a specific format. 
    // Based on v5 migration, we should construct a message with `parts` or use `experimental_attachments` if using a compatibility layer.
    // But since we are on v5, we should use the new `parts` structure if supported by `append`, or check the docs for `useChat` v5 attachment handling.
    // Actually, `useChat` v5 `append` supports `experimental_attachments`? No, it's removed.
    // We should use `parts` or pass files as a separate argument if `append` signature changed?
    // The standard way in v5 for multimodal is to include file parts in the message.
    
    const parts = [
      { type: 'text', text: message.text },
      ...message.files.map(file => ({
        type: 'file',
        url: file.url, 
        mimeType: file.mediaType,
      })),
    ];

    append({
      role: 'user',
      content: message.text, // Fallback text
      // @ts-ignore - parts is the v5 way
      parts: parts,
    });
  }}
>
  <PromptInputTextarea />
  <PromptInputFooter>
    <PromptInputTools>
      <PromptInputActionMenu>
        <PromptInputActionMenuTrigger />
        <PromptInputActionMenuContent>
          <PromptInputActionAddAttachments />
        </PromptInputActionMenuContent>
      </PromptInputActionMenu>
    </PromptInputTools>
    <PromptInputSubmit />
  </PromptInputFooter>
</PromptInput>
```

#### E. Update Chat Route (`src/routes/chat.tsx`)

Import and use the `ChatInterface` component in the chat route.

```tsx
import { ChatInterface } from "@/components/ChatInterface";

function ChatPage() {
  return (
    <PageContainer ...>
      <ChatInterface />
    </PageContainer>
  )
}
```

### 3. Handle File Uploads
The `PromptInput` component supports attachments. We need to ensure these are passed correctly to the `useChat` hook.

- The `ClientSideChatTransport` and `@built-in-ai/core` support multimodal input.
- Ensure `PromptInput` passes files in a format compatible with `append` (e.g., as `experimental_attachments` or part of `content` array if using Vercel AI SDK v5+).

### 4. Handle Model Availability
Model downloading is handled in the Models page.

- Check if the model is available.
- If the model is not available, display a message with a link to the `/models` page.
- Instruct the user to download the Gemini Nano model from the Models page.

### 5. Refine UI/UX
- Add proper styling to ensure the chat window fits the `PageContainer`.
- Ensure the `PromptInput` stays at the bottom.
- Add markdown rendering for bot responses (using `MarkdownView` or similar if available).

## File Structure Changes
- `src/lib/client-side-chat-transport.ts` (New location)
- `src/components/ChatInterface.tsx` (New component)
- `src/routes/chat.tsx` (Modified)

## Next Steps
1. Execute the move of the transport file.
2. Scaffold the `ChatPage` with the basic components.
3. Connect the `useChat` hook.
4. Test with a local model download.
