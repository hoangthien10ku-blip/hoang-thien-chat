import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquare, Users, Settings, LogOut, Shield, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import kinbookLogo from "@/assets/kinbook-logo.png";

// Đặt link APK Kinbook tại đây sau khi build (ví dụ /downloads/kinbook.apk hoặc URL ngoài)
const APK_URL = "/kinbook.apk";

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

type Profile = { id: string; display_name: string; avatar_url: string | null };

export function AppShell({ children }: { children: ReactNode }) {
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

      {/* Mobile top bar with APK download (Android only) */}
      <KinbookMobileHeader />


      <main className="flex-1 min-w-0 flex flex-col">{children}</main>

      {/* Mobile bottom nav */}
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
    </div>
  );
}
