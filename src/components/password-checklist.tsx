import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PwdChecks = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
};

export function checkPassword(pw: string): PwdChecks {
  return {
    length: pw.length >= 8 && pw.length <= 32,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

export function passwordValid(c: PwdChecks) {
  return c.length && c.upper && c.lower && c.digit && c.special;
}

const items: Array<{ key: keyof PwdChecks; label: string }> = [
  { key: "length", label: "8 - 32 ký tự" },
  { key: "upper", label: "Có chữ hoa (A-Z)" },
  { key: "lower", label: "Có chữ thường (a-z)" },
  { key: "digit", label: "Có số (0-9)" },
  { key: "special", label: "Có ký tự đặc biệt" },
];

export function PasswordChecklist({ checks }: { checks: PwdChecks }) {
  return (
    <ul className="mt-1 grid grid-cols-1 gap-y-0.5 text-[11px] sm:grid-cols-2">
      {items.map((it) => {
        const ok = checks[it.key];
        return (
          <li
            key={it.key}
            className={cn(
              "flex items-center gap-1.5",
              ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            {ok ? <Check className="size-3" /> : <X className="size-3" />}
            <span>{it.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
