import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf, isOnline } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  name?: string | null;
  src?: string | null;
  lastSeenAt?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  showStatus?: boolean;
  className?: string;
};

const SIZES = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  xl: "size-20",
};

export function UserAvatar({ name, src, lastSeenAt, size = "md", showStatus, className }: Props) {
  const online = showStatus && isOnline(lastSeenAt);
  return (
    <div className={cn("relative shrink-0", className)}>
      <Avatar className={cn(SIZES[size], "ring-2 ring-background")}>
        {src ? <AvatarImage src={src} alt={name ?? ""} /> : null}
        <AvatarFallback className="gradient-brand text-primary-foreground font-medium">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      {showStatus ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-background",
            online ? "bg-[var(--color-success)]" : "bg-muted-foreground/40"
          )}
        />
      ) : null}
    </div>
  );
}
