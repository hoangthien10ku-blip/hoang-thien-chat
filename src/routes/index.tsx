import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KinBook — Nhắn tin hiện đại" },
      { name: "description", content: "Nhắn tin thời gian thực, kết bạn, chia sẻ khoảnh khắc." },
    ],
  }),
  component: Index,
});

function Index() {
  const { loading, user } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }
  return <Navigate to={user ? "/chat" : "/auth"} replace />;
}
