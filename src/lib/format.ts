export function initialsOf(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function timeShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "vừa xong";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export function isOnline(lastSeenAt?: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 90_000;
}
