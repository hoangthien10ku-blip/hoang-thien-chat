import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { MessageCircleHeart, Loader2 } from "lucide-react";
import { checkPassword, passwordValid, PasswordChecklist } from "@/components/password-checklist";
import { useServerFn } from "@tanstack/react-start";
import { resolveLoginIdentifier } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Đăng nhập — KinBook" },
      { name: "description", content: "Đăng nhập hoặc tạo tài khoản KinBook." },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().email("Email không hợp lệ").max(255);
const nameSchema = z.string().trim().min(1, "Vui lòng nhập tên").max(60);
const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username tối thiểu 3 ký tự")
  .max(30, "Username tối đa 30 ký tự")
  .regex(/^[a-zA-Z0-9_.]+$/, "Username chỉ chứa chữ, số, dấu chấm và gạch dưới");
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?\d[\d\s.-]{5,}$/, "Số điện thoại không hợp lệ")
  .optional()
  .or(z.literal(""));

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const callResolve = useServerFn(resolveLoginIdentifier);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState(""); // email/username/phone
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const pwdChecks = useMemo(() => checkPassword(password), [password]);
  const pwdOk = passwordValid(pwdChecks);

  useEffect(() => {
    if (user) navigate({ to: "/chat", replace: true });
  }, [user, navigate]);

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return toast.error("Vui lòng nhập email, username hoặc số điện thoại");
    if (!password) return toast.error("Vui lòng nhập mật khẩu");
    setBusy(true);
    try {
      // Resolve identifier -> email
      const { email: resolved } = await callResolve({ data: { identifier: identifier.trim() } });
      if (!resolved) {
        toast.error("Không tìm thấy tài khoản phù hợp");
        return;
      }
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: resolved, password });
      if (error) throw error;
      // Check if account is blocked
      if (signInData.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("is_blocked")
          .eq("id", signInData.user.id)
          .maybeSingle();
        if (prof?.is_blocked) {
          await supabase.auth.signOut();
          toast.error("Tài khoản đã bị khóa");
          return;
        }
      }
      toast.success("Đăng nhập thành công");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra";
      toast.error(
        msg.includes("Invalid login") ? "Email/mật khẩu không đúng" : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    try {
      nameSchema.parse(name);
      emailSchema.parse(email);
      usernameSchema.parse(username);
      phoneSchema.parse(phone);
    } catch (err) {
      if (err instanceof z.ZodError) return toast.error(err.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    }
    if (!pwdOk) return toast.error("Mật khẩu chưa đáp ứng đủ yêu cầu");

    setBusy(true);
    try {
      const normalizedPhone = phone.trim() ? phone.trim().replace(/[\s.-]/g, "") : null;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name.trim(),
            username: username.trim(),
            phone: normalizedPhone,
          },
          emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) {
        if (error.message.toLowerCase().includes("already")) {
          toast.error("Email này đã được sử dụng. Hãy đăng nhập.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      // If session present, we're in. Otherwise try to sign in immediately
      // (auto_confirm_email is enabled, so this should succeed).
      if (!data.session) {
        const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
        if (siErr) {
          toast.error(
            siErr.message.includes("Invalid")
              ? "Tài khoản đã được tạo nhưng đăng nhập thất bại. Hãy thử lại."
              : siErr.message,
          );
          return;
        }
      }
      toast.success("Tạo tài khoản thành công 🎉");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Không thể đăng nhập bằng Google");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
    } catch {
      toast.error("Không thể đăng nhập bằng Google");
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-primary/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 size-96 rounded-full bg-fuchsia-400/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-3xl gradient-brand shadow-[var(--shadow-glow)]">
            <MessageCircleHeart className="size-8 text-primary-foreground" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">KinBook</h1>
          <p className="mt-2 text-sm text-muted-foreground">Nhắn tin tức thời. Đẹp. Riêng tư.</p>
        </div>

        <div className="rounded-3xl border bg-card/80 p-6 shadow-xl backdrop-blur">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-muted p-1 text-sm font-medium">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  "rounded-full py-2 transition " +
                  (mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")
                }
              >
                {m === "signin" ? "Đăng nhập" : "Đăng ký"}
              </button>
            ))}
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleSignin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="identifier">Email, username hoặc số điện thoại</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com hoặc tên_tài_khoản"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password-in">Mật khẩu</Label>
                <Input
                  id="password-in"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full rounded-full gradient-brand text-primary-foreground hover:opacity-90 h-11">
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Đăng nhập"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="name">Tên hiển thị</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn A" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                  placeholder="tennguoidung"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-up">Email</Label>
                <Input id="email-up" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">
                  Số điện thoại <span className="text-muted-foreground">(tuỳ chọn)</span>
                </Label>
                <Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901234567" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password-up">Mật khẩu</Label>
                <Input
                  id="password-up"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <PasswordChecklist checks={pwdChecks} />
              </div>
              <Button type="submit" disabled={busy || !pwdOk} className="w-full rounded-full gradient-brand text-primary-foreground hover:opacity-90 h-11">
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Tạo tài khoản"}
              </Button>
            </form>
          )}

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            HOẶC
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button onClick={handleGoogle} variant="outline" disabled={busy} className="w-full rounded-full h-11">
            <GoogleIcon className="size-4" /> Tiếp tục với Google
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Bằng việc tiếp tục, bạn đồng ý với Điều khoản & Chính sách của KinBook.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.5-1.7 4.3-5.5 4.3-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.6 14.6 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export { Navigate };
