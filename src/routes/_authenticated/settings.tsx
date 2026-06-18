import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { LogOut, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Cài đặt — KinBook" },
      { name: "description", content: "Quản lý hồ sơ và tài khoản của bạn." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles").select("display_name, username, bio, avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? "");
        setUsername(data?.username ?? "");
        setBio(data?.bio ?? "");
        setAvatarUrl(data?.avatar_url ?? "");
        setLoading(false);
      });
  }, [user?.id]);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || "Người dùng mới",
        username: username.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message.includes("unique") ? "Tên người dùng đã tồn tại" : "Không thể lưu");
    else toast.success("Đã lưu hồ sơ");
  }

  async function changePassword() {
    if (!newPass || newPass.length < 6) {
      toast.error("Mật khẩu mới tối thiểu 6 ký tự");
      return;
    }
    setChanging(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setChanging(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Đã đổi mật khẩu");
      setOldPass("");
      setNewPass("");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto h-full w-full max-w-2xl space-y-6 overflow-y-auto px-4 py-6 pb-24 md:py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold md:text-3xl">Cài đặt</h1>
          <ThemeToggle />
        </div>

        <section className="rounded-3xl border bg-card p-5 md:p-6">
          <div className="flex items-center gap-4">
            <UserAvatar name={displayName} src={avatarUrl} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold">{displayName || "Người dùng"}</div>
              <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dn">Tên hiển thị</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="un">Tên người dùng</Label>
              <Input id="un" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="tên duy nhất, ví dụ: hoangthien" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="av">Liên kết ảnh đại diện (URL)</Label>
              <Input id="av" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">Tiểu sử</Label>
              <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={200} />
            </div>
            <Button onClick={saveProfile} disabled={saving} className="rounded-full gradient-brand text-primary-foreground self-start">
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Lưu thay đổi
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 md:p-6">
          <h2 className="text-lg font-semibold">Đổi mật khẩu</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mật khẩu tối thiểu 6 ký tự.</p>
          <div className="mt-4 grid gap-3">
            <Input type="password" placeholder="Mật khẩu mới" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            <Button onClick={changePassword} disabled={changing} variant="outline" className="rounded-full self-start">
              {changing && <Loader2 className="mr-2 size-4 animate-spin" />} Cập nhật mật khẩu
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 md:p-6">
          <Button onClick={signOut} variant="destructive" className="rounded-full">
            <LogOut className="mr-2 size-4" /> Đăng xuất
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
