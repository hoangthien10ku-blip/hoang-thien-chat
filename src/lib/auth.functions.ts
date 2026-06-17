import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Resolve a login identifier (email / username / phone) to the real email
 * stored in auth.users so the client can call signInWithPassword.
 *
 * Returns { email } on success or { email: null } if not found.
 * Public endpoint — does not leak whether a password is correct.
 */
export const resolveLoginIdentifier = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ identifier: z.string().trim().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data }) => {
    const id = data.identifier.trim();
    // If looks like an email, just return it directly.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) return { email: id };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Try username first, then phone.
    const looksLikePhone = /^\+?\d[\d\s.-]{5,}$/.test(id);
    const normalizedPhone = looksLikePhone ? id.replace(/[\s.-]/g, "") : null;

    let userId: string | null = null;

    if (!looksLikePhone) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", id)
        .limit(1)
        .maybeSingle();
      if (prof) userId = prof.id;
    }

    if (!userId && normalizedPhone) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", normalizedPhone)
        .limit(1)
        .maybeSingle();
      if (prof) userId = prof.id;
    }

    if (!userId) return { email: null };

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
    return { email: u.user?.email ?? null };
  });

export const checkUsernameAvailable = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ username: z.string().trim().min(3).max(30) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", data.username)
      .limit(1)
      .maybeSingle();
    return { available: !prof };
  });
