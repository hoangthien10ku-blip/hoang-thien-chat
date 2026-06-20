import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquare, Users, Settings, LogOut, Shield, PlusSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import kinbookLogo from "@/assets/kinbook-logo.png";

function isStandalone() {
  return typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true);
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};


type Profile = { id: string; display_name: string; avatar_url: string | null };

export function AppShell({ children, hideMobileNav = false }: { children: ReactNode; hideMobileNav?: boolean }) {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useIsAdmin();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [user?.id]);

  const items = [
    { to: "/chat", icon: MessageSquare, label: "Tin nhắn" },
    { to: "/friends", icon: Users, label: "Bạn bè" },
    ...(isAdmin ? [{ to: "/admin", icon: Shield, label: "Quản trị" } as const] : []),
    { to: "/settings", icon: Settings, label: "Cài đặt" },
  ] as const;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Desktop rail */}
      <aside className="hidden md:flex w-20 shrink-0 flex-col items-center justify-between border-r bg-sidebar py-5">
        <div className="flex flex-col items-center gap-2">
          <Link
            to="/chat"
            className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-[#0A0F1C] overflow-hidden shadow-[var(--shadow-glow)]"
            aria-label="KinBook"
          >
            <img src={kinbookLogo} alt="KinBook" width={44} height={44} className="size-full object-cover" />
          </Link>
          {items.map((it) => {
            const active = pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "group flex size-11 items-center justify-center rounded-2xl transition",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                aria-label={it.label}
              >
                <it.icon className="size-5" />
              </Link>
            );
          })}
        </div>
        <div className="flex flex-col items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Đăng xuất">
            <LogOut className="size-4" />
          </Button>
          <Link to="/settings" aria-label="Hồ sơ">
            <UserAvatar name={profile?.display_name} src={profile?.avatar_url} size="sm" />
          </Link>
        </div>
      </aside>

      {/* Mobile top bar (hidden when chatting) */}
      {!hideMobileNav && <KinbookMobileHeader />}


      <main className={cn("flex-1 min-w-0 flex flex-col", hideMobileNav ? "pt-0" : "pt-[calc(env(safe-area-inset-top)+3rem)] md:pt-0")}>{children}</main>

      {/* Mobile bottom nav */}
      {!hideMobileNav && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          {items.map((it) => {
            const active = pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <it.icon className="size-5" />
                {it.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function KinbookMobileHeader() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setShow(false);
      return;
    }
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setShow(mq.matches);
    update();
    const listener = (e: MediaQueryListEvent) => update();
    mq.addEventListener("change", listener);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      mq.removeEventListener("change", listener);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      setOpen(true);
      return;
    }
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setOpen(false);
  }, [deferredPrompt]);

  if (!show) return null;

  return (
    <header className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between border-b bg-card/95 backdrop-blur px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <Link to="/chat" className="flex items-center gap-2" aria-label="KinBook">
        <img src={kinbookLogo} alt="" width={28} height={28} className="size-7 rounded-lg" />
        <span className="text-sm font-bold tracking-tight">KinBook</span>
      </Link>
      <button
        type="button"
        onClick={install}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-xs font-black",
          "text-[#39FF14] [text-shadow:_0_0_6px_#39FF14,_0_0_12px_#39FF14]",
          "ring-1 ring-[#39FF14]/50",
        )}
      >
        <PlusSquare className="size-3.5" />
        Cài app
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold">Thêm KinBook vào màn hình chính</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Trên Android/Chrome: nhấn <span className="font-medium text-foreground">⋮ → Cài đặt ứng dụng / Thêm vào màn hình chính</span>.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Trên iPhone/Safari: nhấn <span className="font-medium text-foreground">Chia sẻ → Thêm vào màn hình chính</span>.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Sau khi thêm, mở KinBook như một app thực thụ, có icon riêng và trải nghiệm toàn màn hình.
            </p>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setOpen(false)}>Đã hiểu</Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
