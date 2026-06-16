import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const BOT_ID = "00000000-0000-0000-0000-0000000000b0";

export const replyAsBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: parts } = await supabaseAdmin
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", data.conversationId);
    const ids = (parts ?? []).map((p) => p.user_id);
    if (!ids.includes(context.userId)) throw new Error("Forbidden");
    if (!ids.includes(BOT_ID)) throw new Error("Not a bot conversation");

    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("sender_id, content, kind")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(20);
    const history = (msgs ?? [])
      .reverse()
      .filter((m: any) => m.kind === "text" && m.content)
      .map((m: any) => ({
        role: m.sender_id === BOT_ID ? "assistant" : "user",
        content: m.content as string,
      }));

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Bạn là Hoàng Thiên AI, trợ lý thân thiện của ứng dụng Hoàng Thiên Chat. Trả lời ngắn gọn, rõ ràng, lịch sự bằng tiếng Việt.",
          },
          ...history,
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI lỗi ${res.status}: ${t.slice(0, 200)}`);
    }
    const j: any = await res.json();
    const reply: string =
      j?.choices?.[0]?.message?.content?.toString().trim() || "Mình chưa hiểu, bạn nói rõ hơn nhé.";

    await supabaseAdmin.from("messages").insert({
      conversation_id: data.conversationId,
      sender_id: BOT_ID,
      content: reply,
      kind: "text",
    });
    return { ok: true };
  });
