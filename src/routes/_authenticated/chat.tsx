import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { ConversationList } from "@/components/chat/conversation-list";
import { ChatWindow } from "@/components/chat/chat-window";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const search = z.object({ c: z.string().optional() });

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Tin nhắn — KinBook" },
      { name: "description", content: "Nhắn tin thời gian thực với bạn bè." },
    ],
  }),
  validateSearch: search,
  component: ChatPage,
});

function ChatPage() {
  const { c } = useSearch({ from: "/_authenticated/chat" });
  const navigate = useNavigate();
  const select = (id: string) => navigate({ to: "/chat", search: { c: id } });

  return (
    <AppShell hideMobileNav={!!c}>
      <div className={cn("flex h-full min-h-0 w-full overflow-hidden", c ? "pb-0" : "pb-[64px] md:pb-0")}>

        <section
          className={cn(
            "w-full md:w-[360px] md:max-w-[360px] shrink-0 border-r bg-card",
            c && "hidden md:flex"
          )}
        >
          <ConversationList selectedId={c ?? null} onSelect={select} />
        </section>
        <section className={cn("min-w-0 flex-1 flex-col", c ? "flex" : "hidden md:flex")}>
          {c ? (
            <ChatWindow conversationId={c} onBack={() => navigate({ to: "/chat", search: {} })} />
          ) : (
            <EmptyState />
          )}
        </section>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-3xl gradient-brand text-primary-foreground shadow-[var(--shadow-glow)]">
        <MessageSquare className="size-9" />
      </div>
      <h2 className="mt-5 text-2xl font-bold">Tin nhắn của bạn</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Chọn một cuộc trò chuyện để bắt đầu, hoặc thêm bạn mới ở tab Bạn bè.
      </p>
    </div>
  );
}
