import { BadgeCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerifiedBadge({ isBot, className }: { isBot?: boolean; className?: string }) {
  if (isBot) {
    return (
      <Sparkles
        aria-label="Bot AI"
        className={cn("inline-block size-4 text-fuchsia-500 fill-fuchsia-500/20", className)}
      />
    );
  }
  return (
    <BadgeCheck
      aria-label="Đã xác minh"
      className={cn("inline-block size-4 text-sky-500 fill-sky-500/15", className)}
    />
  );
}
