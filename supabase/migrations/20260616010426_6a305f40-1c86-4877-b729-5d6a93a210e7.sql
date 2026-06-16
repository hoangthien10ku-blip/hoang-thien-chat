
-- Fix: creator must be able to SELECT the conversation they just inserted
-- (before participants row exists, is_conversation_member returns false and .select() returns 0 rows)
CREATE POLICY "conversations_select_creator"
ON public.conversations FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Bootstrap admin role for already-existing user (trigger only fires on new signups)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE lower(email) = lower('[email protected]')
ON CONFLICT DO NOTHING;
