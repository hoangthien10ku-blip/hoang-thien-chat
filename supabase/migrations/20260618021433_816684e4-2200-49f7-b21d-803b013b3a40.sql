-- Đổi tên bot
update public.profiles
  set display_name = 'AL God AI',
      username = 'algodai'
  where id = '00000000-0000-0000-0000-0000000000b0';

-- Cập nhật tin nhắn chào mừng của bot
update public.messages
  set content = 'Xin chào! Mình là AL God AI 🤖. Hỏi mình bất cứ điều gì nhé — mình luôn ở đây 24/7.'
  where sender_id = '00000000-0000-0000-0000-0000000000b0'
    and content like 'Xin chào! Mình là Hoàng Thiên AI%';

-- Cấp quyền admin + đặt tên Vibai cho tài khoản chủ (nếu đã tồn tại)
do $$
declare _uid uuid;
begin
  select id into _uid from auth.users
    where lower(email) = lower('[email protected]') limit 1;
  if _uid is not null then
    insert into public.user_roles (user_id, role)
      values (_uid, 'admin') on conflict do nothing;
    update public.profiles set display_name = 'Vibai', is_verified = true where id = _uid;
  end if;
end $$;