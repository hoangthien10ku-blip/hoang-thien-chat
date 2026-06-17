
## Phạm vi

Chia thành 4 nhóm thay đổi độc lập, làm trong cùng một lượt.

---

### 1. Sửa hệ thống tài khoản (đăng ký + đăng nhập)

**Nguyên nhân lỗi hiện tại:** Supabase mặc định bật "Confirm email". Khi user đăng ký, `supabase.auth.signUp` trả về thành công nhưng tài khoản ở trạng thái chưa xác minh → đăng nhập bằng mật khẩu báo "Invalid login credentials". Trang `/auth` hiện tại không xử lý trạng thái này.

**Sửa:**
- Bật `auto_confirm_email = true` qua `supabase--configure_auth` để tài khoản hoạt động ngay sau đăng ký (theo yêu cầu user).
- Trang `/auth`: sau `signUp` thành công, tự động `signInWithPassword` luôn; nếu lỗi thì hiển thị rõ ràng (không báo "đăng ký thành công" giả).
- Thêm validator mật khẩu real-time (8-32 ký tự, hoa, thường, số, ký tự đặc biệt) với checklist ✓ hiển thị dưới ô input.
- Thêm trường **username** (duy nhất) và **số điện thoại** (tuỳ chọn) khi đăng ký. Lưu vào `profiles.username`, `profiles.phone`.
- Cho phép đăng nhập bằng **email / username / số điện thoại + mật khẩu**: tạo server function `resolveLoginIdentifier` tra cứu identifier → email thật, rồi gọi `signInWithPassword(email, password)`.

**Migration cần:**
- Thêm cột `username text unique`, `phone text unique` vào `profiles`.
- Trigger trên `auth.users` đã có (`handle_new_user`) - mở rộng để lấy username/phone từ `raw_user_meta_data`.
- Server function `resolveLoginIdentifier` dùng publishable client + policy `anon` SELECT chỉ trên cột `username, phone, email_hint` qua một view an toàn (không lộ dữ liệu nhạy cảm). Hoặc đơn giản hơn: dùng `supabaseAdmin` trong server fn để tra `auth.users` theo username/phone.

---

### 2. Sửa lỗi tin nhắn không hiện ngay với người gửi

**Nguyên nhân:** `chat-window.tsx` chỉ dựa vào realtime subscription. Supabase Realtime đôi khi không echo INSERT về chính session đã insert, hoặc trùng lặp với optimistic gây lệch.

**Sửa trong `src/components/chat/chat-window.tsx`:**
- Sau khi `insert` message thành công, append ngay vào local state (optimistic) với một `temp_id`.
- Khi realtime trả về INSERT, dedupe theo `id` thật để thay temp message.
- Đồng thời invalidate React Query `['messages', conversationId]` nếu dùng query.

---

### 3. Nâng cấp Hoàng Thiên AI Bot (giống Meta AI/ChatGPT)

**Phạm vi thực tế (cắt gọn cho khả thi trong 1 lượt):**
- **System prompt mạnh + tiêm lại**: prompt cố định định hình tính cách (thân thiện, ngắn gọn 1-3 câu, 0-1 emoji, xưng "mình/bạn"). Luôn đặt ở message đầu mỗi request.
- **Sliding window 40-50 tin nhắn** thay vì 20 (đang là 20).
- **Tóm tắt trung hạn**: khi cuộc trò chuyện > 50 messages, tự động sinh summary lưu vào bảng mới `ai_conversation_memory(conversation_id, summary, updated_at)` và prepend vào context.
- **Bộ nhớ dài hạn theo user**: bảng `ai_user_memory(user_id, key, value, created_at)` - bot tự rút trích "user thích X", "user đang làm Y" và lưu lại. Truy xuất theo user_id mỗi lần chat (không dùng vector DB phức tạp - chỉ select gần đây nhất 20 facts).
- **Streaming response**: chuyển server fn `replyAsBot` sang server route `/api/ai-chat` dùng `streamText` từ AI SDK + Lovable Gateway. Client hiển thị typing indicator + chữ chạy dần.
- **Gợi ý câu hỏi tiếp theo**: sau mỗi reply, AI tự sinh 2-3 suggested replies hiển thị dưới message.
- **Emotion detection nhẹ**: gộp vào system prompt (yêu cầu model phát hiện cảm xúc và điều chỉnh tone), không tách model riêng.
- Model: `google/gemini-3-flash-preview` (nhanh, rẻ).

**Cắt khỏi phạm vi (giải thích lý do trong reply):**
- Vector DB (Chroma/Pinecone): quá nặng, thay bằng bảng `ai_user_memory` đơn giản.
- Web search realtime, tool calling đa năng (tạo ảnh, đọc file): để lượt sau nếu user yêu cầu cụ thể.
- Intent router/semantic router riêng: gộp vào system prompt.

---

### 4. AI bot tự xuất hiện trong danh sách chat, không cần kết bạn

**Sửa:**
- Khi user đăng nhập, tự động tạo (nếu chưa có) một conversation 1-1 giữa user và bot id `00000000-0000-0000-0000-0000000000b0`, đánh dấu `is_pinned = true`.
- Thêm cột `is_pinned boolean default false` vào `conversations`.
- Trong `conversation-list.tsx`: sort pinned lên đầu, gắn badge "AI" và icon ghim.
- Trigger DB: sau khi insert profile mới, tự tạo conversation với bot + 2 participants.
- Bỏ entry "Hoàng Thiên AI" khỏi dialog "Tin nhắn mới" (vì đã ghim sẵn).

---

## Thứ tự thực hiện

1. Migration: thêm cột `username/phone` vào profiles, `is_pinned` vào conversations, bảng `ai_conversation_memory`, `ai_user_memory`, trigger auto-create AI conversation, bật auto_confirm_email.
2. Backfill: tạo AI conversation cho tất cả user đã có.
3. Code đăng ký/đăng nhập (`/auth` route + helpers).
4. Code chat optimistic update.
5. Server route streaming `/api/ai-chat` + cập nhật `chat-window.tsx` để stream + hiển thị suggestions.
6. UI conversation list (pin AI lên đầu).

## Kỹ thuật chính

- TanStack Start server fns + server route streaming với AI SDK (`streamText` qua Lovable Gateway).
- Supabase publishable client cho lookup username/phone (anon SELECT chỉ `id, username, phone` trên `profiles`).
- Realtime: giữ nguyên, thêm dedupe theo message `id`.
- Không thêm vector DB, không thêm dependency mới ngoài `ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible` (cài nếu chưa có).

Sau khi user duyệt, mình sẽ chạy migration trước rồi mới chỉnh code.
