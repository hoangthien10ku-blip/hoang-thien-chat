import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/user-avatar";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search, PenSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NewChatDialog } from "./new-chat-dialog";
import { VerifiedBadge } from "@/components/verified-badge";

export type ConversationItem = {
  id: string;
  is_group: boolean;
  title: string | null;
  avatar_url: string | null;
  last_message_at: string;
  peer?: { id: string; display_name: string; avatar_url: string | null; last_seen_at: string; is_verified?: boolean; is_bot?: boolean };
  last_message?: { content: string | null; kind: string; sender_id: string; recalled: boolean } | null;
  unread: number;
};

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function ConversationList({ selectedId, onSelect }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!user) return;
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at, conversations(id, is_group, title, avatar_url, last_message_at)")
      .eq("user_id", user.id);

    const convs = (parts ?? [])
      .map((p: any) => ({ ...p.conversations, _last_read_at: p.last_read_at }))
      .filter(Boolean)
      .sort((a: any, b: any) => +new Date(b.last_message_at) - +new Date(a.last_message_at));

    const ids = convs.map((c: any) => c.id);
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Fetch other participants
    const { data: allParts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", ids);
    const peerIds = Array.from(
      new Set((allParts ?? []).filter((p) => p.user_id !== user.id).map((p) => p.user_id))
    );
    const { data: peerProfiles } = peerIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, last_seen_at, is_verified, is_bot")
          .in("id", peerIds)
      : { data: [] as any[] };
    const profileById = new Map<string, any>((peerProfiles ?? []).map((p: any) => [p.id, p]));

    // Fetch last messages
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, conversation_id, content, kind, sender_id, recalled, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });

    const lastByConv = new Map<string, any>();
    (msgs ?? []).forEach((m) => {
      if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
    });

    const unreadByConv = new Map<string, number>();
    (msgs ?? []).forEach((m) => {
      const conv = convs.find((c: any) => c.id === m.conversation_id);
      if (!conv) return;
      if (m.sender_id === user.id) return;
      if (new Date(m.created_at) > new Date(conv._last_read_at)) {
        unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
      }
    });

    const result: ConversationItem[] = convs.map((c: any) => {
      const peerPart = (allParts ?? []).find((p) => p.conversation_id === c.id && p.user_id !== user.id);
      const peerProf = peerPart ? profileById.get(peerPart.user_id) : null;
      const peer = !c.is_group && peerProf
        ? {
            id: peerProf.id,
            display_name: peerProf.display_name,
            avatar_url: peerProf.avatar_url,
            last_seen_at: peerProf.last_seen_at,
          }
        : undefined;
      return {
        id: c.id,
        is_group: c.is_group,
        title: c.title,
        avatar_url: c.avatar_url,
        last_message_at: c.last_message_at,
        peer,
        last_message: lastByConv.get(c.id) ?? null,
        unread: unreadByConv.get(c.id) ?? 0,
      };
    });

    setItems(result);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    reload();
    if (!user) return;
    const ch = supabase
      .channel(`conv-list-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const name = c.is_group ? c.title ?? "Nhóm" : c.peer?.display_name ?? "";
      return name.toLowerCase().includes(q);
    });
  }, [items, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Tin nhắn</h2>
          <NewChatDialog onCreated={(id) => onSelect(id)}>
            <Button size="icon" variant="ghost" aria-label="Cuộc trò chuyện mới">
              <PenSquare className="size-5" />
            </Button>
          </NewChatDialog>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trong tin nhắn"
            className="pl-9 rounded-full bg-muted border-transparent"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="space-y-2 p-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl p-2">
                <div className="size-12 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center text-sm text-muted-foreground">
            <p>Chưa có cuộc trò chuyện nào.</p>
            <p className="mt-1">Vào tab Bạn bè để bắt đầu trò chuyện.</p>
          </div>
        ) : (
          <ul className="px-2 py-2">
            {filtered.map((c) => {
              const name = c.is_group ? c.title ?? "Nhóm" : c.peer?.display_name ?? "Người dùng";
              const avatar = c.is_group ? c.avatar_url : c.peer?.avatar_url;
              const preview = previewOf(c.last_message, c.last_message?.sender_id === user?.id);
              const selected = selectedId === c.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition",
                      selected ? "bg-accent" : "hover:bg-accent/60"
                    )}
                  >
                    <UserAvatar name={name} src={avatar} lastSeenAt={c.peer?.last_seen_at} showStatus={!c.is_group} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate font-semibold", c.unread > 0 && "text-foreground")}>{name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(c.last_message_at)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", c.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {preview}
                        </span>
                        {c.unread > 0 && (
                          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full gradient-brand px-1.5 text-[11px] font-semibold text-primary-foreground">
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function previewOf(
  msg: { content: string | null; kind: string; recalled: boolean } | null | undefined,
  isMe: boolean
) {
  if (!msg) return "Bắt đầu trò chuyện…";
  if (msg.recalled) return (isMe ? "Bạn đã thu hồi tin nhắn" : "Tin nhắn đã được thu hồi");
  if (msg.kind === "image") return (isMe ? "Bạn: " : "") + "📷 Ảnh";
  if (msg.kind === "video") return (isMe ? "Bạn: " : "") + "🎬 Video";
  if (msg.kind === "file") return (isMe ? "Bạn: " : "") + "📎 Tệp";
  if (msg.kind === "system") return msg.content ?? "";
  return (isMe ? "Bạn: " : "") + (msg.content ?? "");
}
