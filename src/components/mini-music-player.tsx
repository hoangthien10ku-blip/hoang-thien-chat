import { useEffect, useState } from "react";
import { Music, X, Minus } from "lucide-react";

// Zing MP3 "Chill & Focus" playlist embed.
// Playlist ID có thể đổi sau bằng cách thay PLAYLIST_ID.
const PLAYLIST_ID = "6BZB7600"; // Chill & Focus playlist (Zing MP3)
const EMBED_URL = `https://zingmp3.vn/embed/album/${PLAYLIST_ID}?autoplay=false`;

const STORAGE_KEY = "kinbook.miniMusic.collapsed";

export function MiniMusicPlayer() {
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  if (hidden) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Mở trình phát nhạc"
        className="fixed bottom-[max(15px,env(safe-area-inset-bottom))] right-[15px] md:bottom-5 md:right-5 z-[9999] flex size-12 items-center justify-center rounded-full bg-[#0A0F1C] text-[#39FF14] shadow-2xl ring-1 ring-[#39FF14]/50 hover:scale-105 transition"
      >
        <Music className="size-5" />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-[max(15px,env(safe-area-inset-bottom))] right-[15px] md:bottom-5 md:right-5 z-[9999] overflow-hidden rounded-xl bg-[#0A0F1C] shadow-2xl ring-1 ring-white/10"
      style={{ width: "min(300px, calc(100vw - 30px))" }}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-black/40">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
          <Music className="size-3" /> KinBook Music
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Thu gọn"
            className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label="Đóng"
            className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="h-[100px] md:h-[100px]">
        <iframe
          title="Zing MP3 — Chill & Focus"
          src={EMBED_URL}
          width="100%"
          height="100%"
          frameBorder={0}
          allow="autoplay; encrypted-media"
          className="block w-full h-full"
        />
      </div>
    </div>
  );
}
