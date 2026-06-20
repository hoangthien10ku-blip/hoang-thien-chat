import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { toast } from "sonner";
import { Shield, ShieldOff, Lock, Unlock, Trash2, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_blocked: boolean;
  created_at: string;
};
type ReportRow = {
  id: string;
  reporter_id: string;
  target_user_id: string | null;
  message_id: string | null;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
};

function AdminPage() {
  const { isAdmin, loading } = useIsAdmin();
  const [tab, setTab] = useState<"users" | "reports">("users");
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [ownerIds, setOwnerIds] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [q, setQ] = useState("");

  async function loadUsers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, bio, is_blocked, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setUsers((data as ProfileRow[]) || []);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "owner"]);
    setAdminIds(new Set((roles || []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id)));
    setOwnerIds(new Set((roles || []).filter((r: any) => r.role === "owner").map((r: any) => r.user_id)));
  }

  async function loadReports() {
    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setReports((data as ReportRow[]) || []);
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadReports();
  }, [isAdmin]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Đang tải...
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Shield className="size-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Bạn không có quyền truy cập</h2>
          <p className="text-sm text-muted-foreground">
            Trang này chỉ dành cho quản trị viên.
          </p>
        </div>
      </AppShell>
    );
  }

  async function toggleBlock(u: ProfileRow) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_blocked: !u.is_blocked })
      .eq("id", u.id);
    if (error) return toast.error(error.message);
    toast.success(u.is_blocked ? "Đã mở khoá" : "Đã khoá tài khoản");
    loadUsers();
  }

  async function toggleAdmin(u: ProfileRow) {
    if (ownerIds.has(u.id)) {
      return toast.error("Không thể thay đổi quyền của AL God AI (chủ sở hữu)");
    }
    const isA = adminIds.has(u.id);
    if (isA) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", u.id)
        .eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Đã thu hồi quyền Admin Vibai");
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: u.id, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Đã cấp quyền Admin Vibai");
    }
    loadUsers();
  }

  async function deleteMessage(messageId: string) {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) return toast.error(error.message);
    toast.success("Đã xoá tin nhắn");
  }

  async function setReportStatus(id: string, status: string) {
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Đã cập nhật");
    loadReports();
  }

  const filtered = users.filter((u) =>
    u.display_name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AppShell>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b px-4 py-3 md:px-6">
          <div>
            <h1 className="text-lg font-semibold">Quản trị</h1>
            <p className="text-xs text-muted-foreground">
              Quản lý người dùng và báo cáo vi phạm
            </p>
          </div>
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            <button
              onClick={() => setTab("users")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "users" ? "bg-background shadow" : "text-muted-foreground"
              }`}
            >
              Người dùng
            </button>
            <button
              onClick={() => setTab("reports")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "reports" ? "bg-background shadow" : "text-muted-foreground"
              }`}
            >
              Báo cáo ({reports.filter((r) => r.status === "pending").length})
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          {tab === "users" ? (
            <div className="space-y-3">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm theo tên..."
                  className="pl-9"
                />
              </div>
              <div className="divide-y rounded-2xl border bg-card">
                {filtered.map((u) => {
                  const isA = adminIds.has(u.id);
                  const isOwner = ownerIds.has(u.id);
                  return (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center gap-3 p-3"
                    >
                      <UserAvatar name={u.display_name} src={u.avatar_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="truncate font-medium">{u.display_name}</p>
                          {isOwner && (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              AL GOD AI
                            </span>
                          )}
                          {isA && !isOwner && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              ADMIN VIBAI
                            </span>
                          )}
                          {u.is_blocked && (
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                              ĐÃ KHOÁ
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.bio || "—"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleAdmin(u)}
                          disabled={isOwner}
                          title={isOwner ? "AL God AI không thể bị thay đổi" : undefined}
                        >
                          {isA ? (
                            <>
                              <ShieldOff className="size-4" /> Thu hồi
                            </>
                          ) : (
                            <>
                              <Shield className="size-4" /> Cấp Admin Vibai
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant={u.is_blocked ? "outline" : "destructive"}
                          onClick={() => toggleBlock(u)}
                          disabled={isOwner}
                        >
                          {u.is_blocked ? (
                            <>
                              <Unlock className="size-4" /> Mở khoá
                            </>
                          ) : (
                            <>
                              <Lock className="size-4" /> Khoá
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Không có người dùng.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-semibold">Lý do:</span> {r.reason}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Người báo cáo: {r.reporter_id.slice(0, 8)} • Trạng thái:{" "}
                        <span className="font-medium">{r.status}</span> •{" "}
                        {new Date(r.created_at).toLocaleString("vi-VN")}
                      </p>
                      {r.target_user_id && (
                        <p className="mt-1 text-xs">
                          Tài khoản: {r.target_user_id.slice(0, 8)}
                        </p>
                      )}
                      {r.message_id && (
                        <p className="mt-1 text-xs">Tin nhắn: {r.message_id.slice(0, 8)}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {r.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setReportStatus(r.id, "resolved")}
                          >
                            Đã xử lý
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReportStatus(r.id, "dismissed")}
                          >
                            Bỏ qua
                          </Button>
                        </>
                      )}
                      {r.message_id && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMessage(r.message_id!)}
                        >
                          <Trash2 className="size-4" /> Xoá tin nhắn
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {reports.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Chưa có báo cáo nào.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
