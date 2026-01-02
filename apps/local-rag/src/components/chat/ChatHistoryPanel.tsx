import { memo } from "react";
import { Loader2Icon, Lock, Trash2Icon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CollapsibleContent } from "@/components/ui/collapsible";
import { getDefaultChatTitle, type ChatSummary } from "@/lib/chat-storage";

type ChatHistoryPanelProps = {
  chats: ChatSummary[];
  activeChatId: string | null;
  isChatLoading: boolean;
  onSelectChat: (chatId: string) => void;
  onRequestDeleteChat: (chat: ChatSummary) => void;
};

export const ChatHistoryPanel = memo(function ChatHistoryPanel({
  chats,
  activeChatId,
  isChatLoading,
  onSelectChat,
  onRequestDeleteChat,
}: ChatHistoryPanelProps) {
  return (
    <CollapsibleContent
      forceMount
      className="flex h-full overflow-hidden transition-[width] duration-200 ease-out data-[state=closed]:w-0 data-[state=closed]:border-r-0 data-[state=open]:w-72"
    >
      <div className="flex h-full w-72 flex-col border-r bg-muted/30">
        <div className="flex items-center justify-between px-3 py-3">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Chat History
          </span>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {isChatLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Loading chats...
              </div>
            ) : chats.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                No chats yet.
              </div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-md px-2 py-2 text-left text-sm transition-colors ${
                    chat.id === activeChatId
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectChat(chat.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectChat(chat.id);
                    }
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {chat.quotaOverflowState && (
                      <Lock className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {chat.title || getDefaultChatTitle()}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDeleteChat(chat);
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    <span className="sr-only">Delete chat</span>
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </CollapsibleContent>
  );
});
