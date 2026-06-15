import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, UserPlus, Check, X, MessageSquare, UserMinus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Profile = { id: string; display_name: string; avatar_url: string | null; last_seen_at: string; username: string | null };
type Friendship = { id: string; requester_id: string; addressee_id: string; status: "pending" | "accepted" };

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({
    meta: [
      { title: "Bạn bè — Hoàng Thiên Chat" },
      { name: "description", content: "Tìm và kết nối bạn bè." },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("friends");
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function loadFriendships() {
    if (!user) return;
    const { data } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const list = (data ?? []) as Friendship[];
    setFriendships(list);
    const ids = Array.from(new Set(list.flatMap((f) => [f.requester_id, f.addressee_id]))).filter((id) => id !== user.id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, last_seen_at, username")
        .in("id", ids);
      setProfiles(new Map((profs ?? []).map((p: any) => [p.id, p])));
    }
  }

  useEffect(() => {
    loadFriendships();
    if (!user) return;
    const ch = supabase
      .channel(`friends-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadFriendships())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // search debounce
  useEffect(() => {
    if (!user || !query.trim()) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, last_seen_at, username")
        .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
        .neq("id", user.id)
        .limit(20);
      setSearchResults((data ?? []) as Profile[]);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, user?.id]);

  const accepted = useMemo(() => friendships.filter((f) => f.status === "accepted"), [friendships]);
  const incoming = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === user?.id),
    [friendships, user?.id]
  );
  const outgoing = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.requester_id === user?.id),
    [friendships, user?.id]
  );

  function relationFor(otherId: string): { kind: "none" | "friend" | "incoming" | "outgoing"; fid?: string } {
    const f = friendships.find(
      (x) =>
        (x.requester_id === user?.id && x.addressee_id === otherId) ||
        (x.addressee_id === user?.id && x.requester_id === otherId)
    );
    if (!f) return { kind: "none" };
    if (f.status === "accepted") return { kind: "friend", fid: f.id };
    if (f.requester_id === user?.id) return { kind: "outgoing", fid: f.id };
    return { kind: "incoming", fid: f.id };
  }

  async function sendRequest(otherId: string) {
    if (!user) return;
    setBusy(otherId);
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: otherId,
      status: "pending",
    });
    setBusy(null);
    if (error) {
      toast.error(error.message.includes("unique") ? "Đã có yêu cầu" : "Không thể gửi yêu cầu");
    } else toast.success("Đã gửi lời mời");
  }

  async function accept(fid: string) {
    setBusy(fid);
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", fid);
    setBusy(null);
    if (error) toast.error("Không thể chấp nhận");
    else toast.success("Đã trở thành bạn bè!");
  }

  async function remove(fid: string) {
    setBusy(fid);
    const { error } = await supabase.from("friendships").delete().eq("id", fid);
    setBusy(null);
    if (error) toast.error("Không thể xoá");
  }

  async function startChat(otherId: string) {
    if (!user) return;
    setBusy(otherId);
    try {
      const { data: mine } = await supabase
        .from("conversation_participants")
        .select("conversation_id, conversations!inner(is_group)")
        .eq("user_id", user.id);
      const myConvIds = (mine ?? []).filter((r: any) => r.conversations?.is_group === false).map((r: any) => r.conversation_id);
      let existingId: string | null = null;
      if (myConvIds.length > 0) {
        const { data: theirs } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", otherId)
          .in("conversation_id", myConvIds);
        existingId = (theirs ?? [])[0]?.conversation_id ?? null;
      }
      let convId = existingId;
      if (!convId) {
        const { data: conv, error } = await supabase
          .from("conversations").insert({ is_group: false, created_by: user.id }).select("id").single();
        if (error) throw error;
        convId = conv.id;
        const { error: pErr } = await supabase.from("conversation_participants").insert([
          { conversation_id: convId, user_id: user.id },
          { conversation_id: convId, user_id: otherId },
        ]);
        if (pErr) throw pErr;
      }
      window.location.assign(`/chat?c=${convId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 pb-24 md:py-10">
        <h1 className="mb-1 text-2xl font-bold md:text-3xl">Bạn bè</h1>
        <p className="mb-6 text-sm text-muted-foreground">Tìm kiếm, kết nối và trò chuyện.</p>

        <div className="mb-6 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc tên người dùng…"
            className="pl-9 rounded-full h-11 bg-muted border-transparent"
          />
        </div>

        {query.trim() ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Kết quả tìm kiếm</h2>
            {searchResults.length === 0 ? (
              <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
                Không tìm thấy người dùng nào
              </p>
            ) : (
              <ul className="space-y-2">
                {searchResults.map((p) => {
                  const rel = relationFor(p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                      <UserAvatar name={p.display_name} src={p.avatar_url} lastSeenAt={p.last_seen_at} showStatus />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-semibold">{p.display_name}</div>
                        {p.username && <div className="truncate text-xs text-muted-foreground">@{p.username}</div>}
                      </div>
                      {rel.kind === "none" && (
                        <Button size="sm" onClick={() => sendRequest(p.id)} disabled={busy === p.id} className="rounded-full gradient-brand text-primary-foreground">
                          <UserPlus className="mr-1 size-4" /> Thêm bạn
                        </Button>
                      )}
                      {rel.kind === "outgoing" && (
                        <Button size="sm" variant="outline" disabled className="rounded-full">Đã gửi</Button>
                      )}
                      {rel.kind === "incoming" && rel.fid && (
                        <Button size="sm" onClick={() => accept(rel.fid!)} disabled={busy === rel.fid} className="rounded-full">
                          <Check className="mr-1 size-4" /> Chấp nhận
                        </Button>
                      )}
                      {rel.kind === "friend" && (
                        <Button size="sm" variant="outline" onClick={() => startChat(p.id)} disabled={busy === p.id} className="rounded-full">
                          <MessageSquare className="mr-1 size-4" /> Nhắn tin
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-3 rounded-full bg-muted p-1">
              <TabsTrigger value="friends" className="rounded-full">Bạn bè ({accepted.length})</TabsTrigger>
              <TabsTrigger value="incoming" className="rounded-full">Lời mời ({incoming.length})</TabsTrigger>
              <TabsTrigger value="outgoing" className="rounded-full">Đã gửi ({outgoing.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="friends" className="mt-4 space-y-2">
              {accepted.length === 0 ? (
                <Empty text="Bạn chưa có bạn bè. Hãy tìm kiếm phía trên!" />
              ) : (
                accepted.map((f) => {
                  const otherId = f.requester_id === user?.id ? f.addressee_id : f.requester_id;
                  const p = profiles.get(otherId);
                  if (!p) return null;
                  return (
                    <Row key={f.id} p={p}>
                      <Button size="sm" variant="outline" onClick={() => startChat(p.id)} disabled={busy === p.id} className="rounded-full">
                        <MessageSquare className="mr-1 size-4" /> Nhắn tin
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(f.id)} disabled={busy === f.id} className="rounded-full">
                        <UserMinus className="size-4" />
                      </Button>
                    </Row>
                  );
                })
              )}
            </TabsContent>
            <TabsContent value="incoming" className="mt-4 space-y-2">
              {incoming.length === 0 ? (
                <Empty text="Không có lời mời nào." />
              ) : (
                incoming.map((f) => {
                  const p = profiles.get(f.requester_id);
                  if (!p) return null;
                  return (
                    <Row key={f.id} p={p}>
                      <Button size="sm" onClick={() => accept(f.id)} disabled={busy === f.id} className="rounded-full gradient-brand text-primary-foreground">
                        <Check className="mr-1 size-4" /> Chấp nhận
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(f.id)} disabled={busy === f.id} className="rounded-full">
                        <X className="size-4" />
                      </Button>
                    </Row>
                  );
                })
              )}
            </TabsContent>
            <TabsContent value="outgoing" className="mt-4 space-y-2">
              {outgoing.length === 0 ? (
                <Empty text="Bạn chưa gửi lời mời nào." />
              ) : (
                outgoing.map((f) => {
                  const p = profiles.get(f.addressee_id);
                  if (!p) return null;
                  return (
                    <Row key={f.id} p={p}>
                      <Button size="sm" variant="outline" onClick={() => remove(f.id)} disabled={busy === f.id} className="rounded-full">
                        Huỷ
                      </Button>
                    </Row>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}

function Row({ p, children }: { p: Profile; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
      <UserAvatar name={p.display_name} src={p.avatar_url} lastSeenAt={p.last_seen_at} showStatus />
      <div className="flex-1 min-w-0">
        <div className="truncate font-semibold">{p.display_name}</div>
        {p.username && <div className="truncate text-xs text-muted-foreground">@{p.username}</div>}
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">{text}</p>;
}
