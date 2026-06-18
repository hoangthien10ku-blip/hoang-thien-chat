import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerifiedBadge({ isBot, className }: { isBot?: boolean; className?: string }) {
  if (isBot) {
    return (
      <span
        aria-label="AL God AI"
        className={cn(
          "inline-flex items-center justify-center rounded-md bg-black px-1.5 py-0.5 text-[10px] font-black leading-none tracking-wider align-middle",
          "text-[#39FF14] [text-shadow:_0_0_6px_#39FF14,_0_0_12px_#39FF14]",
          "ring-1 ring-[#39FF14]/40",
          className,
        )}
      >
        AL
      </span>
    );
  }
  return (
    <BadgeCheck
      aria-label="Đã xác minh"
      className={cn("inline-block size-4 text-sky-500 fill-sky-500/15", className)}
    />
  );
}
