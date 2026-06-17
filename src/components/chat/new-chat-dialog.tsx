import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Friend = { id: string; display_name: string; avatar_url: string | null; last_seen_at: string };

export function NewChatDialog({ children, onCreated }: { children: ReactNode; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      const ids = (data ?? []).map((r) => (r.requester_id === user.id ? r.addressee_id : r.requester_id));
      if (ids.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, last_seen_at")
        .in("id", ids);
      setFriends((profs ?? []) as Friend[]);
      setLoading(false);
    })();
  }, [open, user?.id]);

  async function startChat(otherId: string) {
    if (!user) return;
    setBusyId(otherId);
    try {
      // Try to find existing direct conversation containing both
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
          .from("conversations")
          .insert({ is_group: false, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        convId = conv.id;
        const { error: pErr } = await supabase.from("conversation_participants").insert([
          { conversation_id: convId, user_id: user.id },
          { conversation_id: convId, user_id: otherId },
        ]);
        if (pErr) throw pErr;
      }
      setOpen(false);
      onCreated(convId!);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thể tạo cuộc trò chuyện");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tin nhắn mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-1" />

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : friends.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có bạn bè. Hãy thêm bạn ở tab "Bạn bè".
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto border-t pt-2">
            {friends.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => startChat(f.id)}
                  disabled={busyId === f.id}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-accent disabled:opacity-50"
                >
                  <UserAvatar name={f.display_name} src={f.avatar_url} lastSeenAt={f.last_seen_at} showStatus />
                  <span className="flex-1 font-medium">{f.display_name}</span>
                  {busyId === f.id && <Loader2 className="size-4 animate-spin" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
