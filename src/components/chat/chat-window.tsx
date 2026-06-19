import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Smile, Paperclip, MoreVertical, Image as ImageIcon, Undo2, Trash2 } from "lucide-react";
import { timeShort, isOnline, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { VerifiedBadge } from "@/components/verified-badge";
import { useServerFn } from "@tanstack/react-start";
import { replyAsBot, BOT_ID } from "@/lib/ai-bot.functions";

type Msg = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  kind: "text" | "image" | "video" | "file" | "system";
  attachment_url: string | null;
  attachment_name: string | null;
  recalled: boolean;
  deleted_for: string[];
  reply_to: string | null;
  created_at: string;
};

type Header = {
  name: string;
  avatar: string | null;
  lastSeenAt?: string;
  isGroup: boolean;
  isVerified?: boolean;
  isBot?: boolean;
};

export function ChatWindow({ conversationId, onBack }: { conversationId: string; onBack?: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [header, setHeader] = useState<Header | null>(null);
  const [peers, setPeers] = useState<Map<string, { display_name: string; avatar_url: string | null }>>(new Map());
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState<string[]>([]);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callReplyAsBot = useServerFn(replyAsBot);
  const isBotConv = header?.isBot === true;

  // Load header + peers
  useEffect(() => {
    if (!user || !conversationId) return;
    (async () => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, is_group, title, avatar_url")
        .eq("id", conversationId)
        .maybeSingle();
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id, last_read_at")
        .eq("conversation_id", conversationId);
      const ids = (parts ?? []).map((p) => p.user_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, display_name, avatar_url, last_seen_at, is_verified, is_bot").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      setPeers(new Map((profs ?? []).map((p: any) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }])));

      if (conv?.is_group) {
        setHeader({ name: conv.title ?? "Nhóm", avatar: conv.avatar_url, isGroup: true });
      } else {
        const otherId = ids.find((id) => id !== user.id);
        const other = otherId ? map.get(otherId) : null;
        setHeader({
          name: other?.display_name ?? "Người dùng",
          avatar: other?.avatar_url ?? null,
          lastSeenAt: other?.last_seen_at,
          isGroup: false,
          isVerified: other?.is_verified ?? false,
          isBot: other?.is_bot ?? false,
        });
      }
      const otherPart = (parts ?? []).find((p) => p.user_id !== user.id);
      setOtherReadAt(otherPart?.last_read_at ?? null);
    })();
  }, [conversationId, user?.id]);

  // Load + subscribe messages
  useEffect(() => {
    if (!user || !conversationId) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (mounted) setMessages((data ?? []) as Msg[]);
    })();


    const ch = supabase
      .channel(`conv-${conversationId}`, { config: { presence: { key: user.id } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        setMessages((prev) => (prev.some((m) => m.id === (payload.new as Msg).id) ? prev : [...prev, payload.new as Msg]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        setMessages((prev) => prev.map((m) => (m.id === (payload.new as Msg).id ? (payload.new as Msg) : m)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as Msg).id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const np = payload.new as { user_id: string; last_read_at: string };
        if (np.user_id !== user.id) setOtherReadAt(np.last_read_at);
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, Array<{ typing?: boolean; user_id: string }>>;
        const t: string[] = [];
        for (const key in state) {
          const arr = state[key];
          if (arr.some((p) => p.typing) && key !== user.id) t.push(key);
        }
        setTyping(t);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ user_id: user.id, typing: false, online_at: new Date().toISOString() });
        }
      });
    channelRef.current = ch;

    // Mark as read on open
    supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .then(() => {});

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [conversationId, user?.id]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing.length]);

  // Mark as read when new messages arrive
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.sender_id !== user.id) {
      supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .then(() => {});
    }
  }, [messages.length, user?.id, conversationId]);

  // Typing presence
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleInputChange(value: string) {
    setInput(value);
    const ch = channelRef.current;
    if (!ch || !user) return;
    ch.track({ user_id: user.id, typing: true, online_at: new Date().toISOString() });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      ch.track({ user_id: user.id, typing: false, online_at: new Date().toISOString() });
    }, 2000);
  }

  async function sendText() {
    if (!user || !input.trim()) return;
    const content = input.trim();
    setInput("");
    const ch = channelRef.current;
    if (ch) ch.track({ user_id: user.id, typing: false, online_at: new Date().toISOString() });

    // Optimistic insert
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Msg = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      kind: "text",
      attachment_url: null,
      attachment_name: null,
      recalled: false,
      deleted_for: [],
      reply_to: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        kind: "text",
      })
      .select("*")
      .single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error("Gửi không thành công");
      return;
    }
    // Replace temp with real message (dedupe if realtime already added it)
    setMessages((prev) => {
      const withoutTemp = prev.filter((m) => m.id !== tempId);
      if (withoutTemp.some((m) => m.id === inserted.id)) return withoutTemp;
      return [...withoutTemp, inserted as Msg];
    });

    if (isBotConv) {
      try {
        await callReplyAsBot({ data: { conversationId } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Bot không trả lời được");
      }
    }
  }

  async function recall(id: string) {
    const { error } = await supabase.from("messages").update({ recalled: true, content: null }).eq("id", id);
    if (error) toast.error("Không thể thu hồi");
  }

  async function deleteForMe(id: string) {
    if (!user) return;
    const msg = messages.find((m) => m.id === id);
    if (!msg) return;
    const next = Array.from(new Set([...(msg.deleted_for ?? []), user.id]));
    const { error } = await supabase.from("messages").update({ deleted_for: next }).eq("id", id);
    if (error) toast.error("Không thể xoá");
  }

  if (!header) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Đang tải…</div>;
  }

  const online = !header.isGroup && isOnline(header.lastSeenAt);
  const visibleMessages = messages.filter((m) => !(m.deleted_for ?? []).includes(user?.id ?? ""));
  const lastMyMsg = [...visibleMessages].reverse().find((m) => m.sender_id === user?.id);
  const seenByOther =
    !header.isGroup &&
    lastMyMsg &&
    otherReadAt &&
    new Date(otherReadAt) >= new Date(lastMyMsg.created_at);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-3 py-3 md:px-5">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <UserAvatar name={header.name} src={header.avatar} lastSeenAt={header.lastSeenAt} showStatus={!header.isGroup} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold flex items-center gap-1">
            <span className="truncate">{header.name}</span>
            {header.isVerified && <VerifiedBadge isBot={header.isBot} />}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {header.isBot
              ? "Trợ lý AI · luôn sẵn sàng"
              : header.isGroup
              ? "Nhóm chat"
              : online
              ? "Đang hoạt động"
              : header.lastSeenAt
              ? `Hoạt động ${relativeTime(header.lastSeenAt)} trước`
              : "Ngoại tuyến"}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Thêm">
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={async () => {
                if (!user) return;
                const otherId = Array.from(peers.keys()).find((id) => id !== user.id) ?? null;
                const { error } = await supabase.from("reports").insert({
                  reporter_id: user.id,
                  target_user_id: otherId,
                  reason: `Báo cáo cuộc trò chuyện ${conversationId}`,
                });
                if (error) toast.error("Không gửi được báo cáo");
                else toast.success("Đã gửi báo cáo. Cảm ơn bạn!");
              }}
            >
              Báo cáo cuộc trò chuyện
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                if (!user) return;
                if (!confirm("Xoá cuộc trò chuyện này khỏi danh sách của bạn?")) return;
                const { error } = await supabase
                  .from("conversation_participants")
                  .delete()
                  .eq("conversation_id", conversationId)
                  .eq("user_id", user.id);
                if (error) toast.error("Không thể xoá");
                else {
                  toast.success("Đã xoá cuộc trò chuyện");
                  onBack?.();
                }
              }}
            >
              Xoá cuộc trò chuyện
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-1">
          {visibleMessages.length === 0 && (
            <div className="my-10 text-center text-sm text-muted-foreground">
              Hãy gửi tin nhắn đầu tiên 👋
            </div>
          )}
          {visibleMessages.map((m, i) => {
            const isMe = m.sender_id === user?.id;
            const prev = visibleMessages[i - 1];
            const next = visibleMessages[i + 1];
            const groupedTop = prev && prev.sender_id === m.sender_id && +new Date(m.created_at) - +new Date(prev.created_at) < 5 * 60_000;
            const groupedBottom = next && next.sender_id === m.sender_id && +new Date(next.created_at) - +new Date(m.created_at) < 5 * 60_000;
            const showTime = !groupedTop;
            return (
              <Bubble
                key={m.id}
                msg={m}
                isMe={isMe}
                showTime={showTime}
                groupedTop={!!groupedTop}
                groupedBottom={!!groupedBottom}
                showAvatar={!isMe && !header.isGroup ? false : !isMe && !groupedBottom}
                senderName={header.isGroup ? peers.get(m.sender_id)?.display_name : undefined}
                senderAvatar={peers.get(m.sender_id)?.avatar_url}
                onRecall={() => recall(m.id)}
                onDeleteForMe={() => deleteForMe(m.id)}
              />
            );
          })}
          {typing.length > 0 && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-2xl bg-muted px-3 py-2 text-muted-foreground">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          )}
          {seenByOther && (
            <div className="self-end mt-1 text-[11px] text-muted-foreground">Đã xem</div>
          )}
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendText();
        }}
        className="border-t bg-card/80 px-3 py-3 md:px-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:pb-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Button type="button" size="icon" variant="ghost" aria-label="Đính kèm" disabled>
            <Paperclip className="size-5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Ảnh" disabled>
            <ImageIcon className="size-5" />
          </Button>
          <Input
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Nhắn tin Aa…"
            className="rounded-full bg-muted border-transparent h-11"
            autoComplete="off"
          />
          <Button type="button" size="icon" variant="ghost" aria-label="Cảm xúc" disabled>
            <Smile className="size-5" />
          </Button>
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            className="size-10 rounded-full gradient-brand text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function Bubble({
  msg, isMe, showTime, groupedTop, groupedBottom, showAvatar, senderName, senderAvatar,
  onRecall, onDeleteForMe,
}: {
  msg: Msg;
  isMe: boolean;
  showTime: boolean;
  groupedTop: boolean;
  groupedBottom: boolean;
  showAvatar: boolean;
  senderName?: string;
  senderAvatar?: string | null;
  onRecall: () => void;
  onDeleteForMe: () => void;
}): ReactNode {
  return (
    <div className={cn("flex w-full items-end gap-2", isMe ? "justify-end" : "justify-start", groupedTop ? "mt-0.5" : "mt-2")}>
      {!isMe && (
        <div className="w-8 shrink-0">
          {showAvatar ? <UserAvatar name={senderName} src={senderAvatar} size="sm" /> : null}
        </div>
      )}
      <div className={cn("flex max-w-[78%] flex-col", isMe ? "items-end" : "items-start")}>
        {showTime && (
          <span className="mb-0.5 px-2 text-[11px] text-muted-foreground">
            {senderName && !isMe && <span className="mr-1 font-medium">{senderName}</span>}
            {timeShort(msg.created_at)}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "group relative max-w-full whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug shadow-[var(--shadow-bubble)] transition",
                isMe
                  ? "bg-[var(--color-bubble-out)] text-[var(--color-bubble-out-foreground)]"
                  : "bg-[var(--color-bubble-in)] text-[var(--color-bubble-in-foreground)]",
                bubbleRadius(isMe, groupedTop, groupedBottom),
                msg.recalled && "italic opacity-60"
              )}
            >
              {msg.recalled ? "Tin nhắn đã được thu hồi" : msg.content}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isMe ? "end" : "start"}>
            {isMe && !msg.recalled && (
              <DropdownMenuItem onClick={onRecall}>
                <Undo2 className="mr-2 size-4" /> Thu hồi với mọi người
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDeleteForMe}>
              <Trash2 className="mr-2 size-4" /> Xoá ở phía bạn
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function bubbleRadius(isMe: boolean, top: boolean, bottom: boolean) {
  // Soft 18px with tighter side on grouped messages
  const base = "rounded-2xl";
  if (isMe) {
    return cn(
      base,
      top && "rounded-tr-md",
      bottom && "rounded-br-md"
    );
  }
  return cn(
    base,
    top && "rounded-tl-md",
    bottom && "rounded-bl-md"
  );
}
