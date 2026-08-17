# 🚀 TỔNG HỢP TÍNH NĂNG HỆ THỐNG "THẤT NGHIỆP" MINECRAFT AUTO-BUILDER

> **Hệ thống Multi-Bot Mineflayer tự động xếp chữ THẤT NGHIỆP (421,227 Pixels) trong Minecraft tại Y=250**  
> **Server mặc định:** `cloudy.pikamc.vn:25311` | **Phiên bản:** `1.20.2` / `26.2` (Auto-Detect Protocol)

---

## 📌 DANH SÁCH 9 TÍNH NĂNG CỐT LÕI

---

### 1. 🖼️ Ma Trận Pixel & Chuyển Đổi Tọa Độ 3D Trung Tâm Duy Nhất
- **Phân tích ảnh:** Đọc ma trận ảnh `THẤT NGHIỆP.png` ($1888 \times 1240$, tổng 2,341,120 pixels) và trích xuất **421,227 pixel đen**.
- **Gốc tọa độ quy ước $(0,0)$:** Quy ước gốc $(0,0)$ là **trung tâm hình học của CẢ 2 TỪ "THẤT NGHIỆP"** ($X=943.5, Y=619.0$).
- **Công thức ánh xạ 3D Minecraft:**
  $$X_{Minecraft} = \text{round}(x_{ảnh} - 943.5)$$
  $$Y_{Minecraft} = 250\quad \text{(Cao độ tầng đặt cố định)}$$
  $$Z_{Minecraft} = \text{round}(y_{ảnh} - 619.0)$$
- **Phân vùng 10 chữ cái độc lập:** Gom nhóm pixel và gán 10 giường trung tâm cho: `T1` (30,938), `H1` (46,494), `Ấ` (51,577), `T2` (30,938), `N` (55,170), `G` (48,735), `H2` (46,494), `I` (19,500), `Ệ` (51,116), `P` (40,265).

---

### 2. 🎯 Người Dùng Gán Chữ & Bot Build Theo Ma Trận Pixel
- **Nguồn cấu hình:** Người dùng chọn chữ cụ thể (`T1`, `H1`, `A_HAT_SAC`...) cho từng tài khoản/thẻ builder. Hệ thống không tự đổi chữ theo vị trí bot.
- `assignedLetterId` do người dùng chọn là nguồn dữ liệu duy nhất để engine nạp đúng ma trận pixel của chữ đó. Một chữ không cho phép hai builder cùng kết nối.
- **Build thật:** Bot dùng `mineflayer-pathfinder` đi tới pixel, kiểm tra block đã tồn tại, trang bị block cấu hình (`black_concrete` mặc định), tìm block đỡ và gọi `placeBlock`. Tiến độ chỉ tăng sau khi block thực sự có mặt/đặt thành công.
- Khi hết vật liệu bot chuyển sang `NEED_BLOCKS`; khi không thể tiếp cận/đặt block sau nhiều lần thử bot chuyển sang `BLOCKED` và không ghi tiến độ giả.

---

### 3. 🛏️ Tự Động Quét Giường & Vòng Lặp Tự Sát Hồi Sinh (Bed Spawnpoint Loop)
- **Nút bấm:** 🛏️ **`Set Spawnpoint`**.
- **Quét Giường tự động:** Bot quét toàn bộ khối Giường (Bed block) trong bán kính 16m xung quanh vị trí đứng, tự di chuyển tới và thực hiện `bot.sleep()` / `bot.activateBlock()` để lưu Spawnpoint chuẩn.
- **Vòng lặp tự sát tối ưu:** Khi bot đặt hết block trong túi đồ, bot nhảy tự sát xuống vực $Y=0$ để **hồi sinh tức thì tại Giường trung tâm $Y=250$**, tiết kiệm 3x thời gian đi bộ quay về.

---

### 4. 🔑 Auto-Auth Engine & Thanh Gửi Lệnh Command Nhanh (Quick Command Bar)
- **Chuỗi Đăng Nhập Tự Động:**
  - Tự động gửi `/login 1234` (hoặc Password tùy chỉnh) sau 1.2s khi spawn vào game.
  - Lắng nghe tín hiệu yêu cầu Auth từ cả 3 kênh: **Chat, Title và Actionbar** để tự động phản hồi `/register 1234 1234` hoặc `/login 1234`.
- **Quick Command Bar:** Khung gửi lệnh trực tiếp trên Web Dashboard cho phép chọn gửi lệnh Slash Command (`/register`, `/login`, `/spawn`, `/server`...) tới từng Bot hoặc **🌐 Tất Cả Bot**.

---

### 5. ⏰ Bot TimeKeeper Treo Tại The End
- **Tên Bot mặc định:** `XinChiDungDi` (Có thể tùy chỉnh tên tùy ý trên UI).
- **Độc lập hoàn toàn:** Bot này **không xếp block và không ngủ**. Bot được chuẩn bị sẵn ở The End; sau khi đăng nhập nó chỉ treo máy tại vị trí hiện tại, chống AFK định kỳ và đọc tick ngày/đêm.
- **Theo dõi dimension:** Dashboard hiển thị dimension Mineflayer đang nhận để xác minh bot đã sang The End.
- **Tự động Chat báo giờ:** Ngay khi vào game, Bot tự động quy đổi Ticks sang giờ chuẩn 24h `HH:MM` và Chat lên Server:
  > `[TimeKeeper] Đã kết nối! Thời gian In-Game hiện tại: 06:30 (6000 ticks) - ☀️ TRỜI SÁNG`
- **Quản lý builder theo ngày/đêm:** Khi bắt đầu tối (`12541 <= time < 23458`), TimeKeeper vẫn online ở The End và chỉ ngắt những builder đang chạy. Khi sáng, hệ thống chỉ kết nối lại đúng nhóm builder đã bị tạm dừng; bot đã dừng thủ công không bị tự bật lại.

---

### 6. 📦 Quản Lý Chi Tiết Rương Shulker Box (Shulker Box Manager)
- **Lưu trữ dữ liệu:** Lưu sạch tại `data/shulkers.json` (mặc định mảng rỗng `[]` để người dùng tự thêm rương thực tế).
- **Bộ lọc thông minh:**
  - Lọc theo từng Chữ cái (`T1`, `H1`, `Ấ`...).
  - Lọc theo Trạng thái: `Khả dụng (AVAILABLE)`, `Đang dùng (IN_USE)`, `Đã hết block (DEPLETED)`.
  - Ô tìm kiếm tên rương / tọa độ $X, Y, Z$.
- **Thanh dung tích:** Hiển thị progress bar dung tích block trừ lùi từ $1,728$ blocks ($27 \text{ stacks} \times 64$).

---

### 7. 🛌 Quản Lý Tài Khoản & Bot AFK Giữ Chunk (Custom AFK Bots)
- **Tài khoản lưu trữ:** Lưu tại `data/accounts.json` (mảng rỗng `[]`), cho phép lưu Username / Password / Loại Auth (Offline / Microsoft) / Chữ cái gán.
- **Bot AFK:** Khung nhập Username tạo Bot AFK tùy chỉnh để đứng giữ Chunk hoặc chống Anti-AFK.

---

### 8. 📜 Live Console Terminal Log (Nhật Ký Hệ Thống Real-Time)
- **Giao diện Terminal Linux:** Màn hình Console màu tối JetBrains Mono hiển thị Real-time log từ WebSocket.
- **Phân màu chuẩn:** 
  - 🟢 **Success:** Đăng nhập thành công, set spawnpoint, trời sáng.
  - 🟡 **Warning:** Cảnh báo trời tối, tự sát/respawn, yêu cầu register.
  - 🔴 **Error:** Lỗi kết nối, bị kick khỏi server.
  - 🔵 **Info:** Đang gửi lệnh, trạng thái hệ thống.
- **Công cụ:** Nút `🗑 Xóa Log` và công tắc `Tự cuộn màn hình` (Auto-scroll).

---

### 9. 🎨 Thiết Kế Web Dashboard Sidebar Dọc & Deploy Railway / Docker
- **Giao diện Sidebar dọc (Left Navigation Bar):** 8 Tab chuyển đổi mượt mà bên trái, tối ưu diện tích hiển thị.
- **Thanh Progress Bar Tổng:** Nằm ở trên cùng hiển thị tổng % hoàn thành 421,227 pixels của từ **THẤT NGHIỆP**.
- **Đóng gói Railway:** Tích hợp `Dockerfile`, `railway.json`, `Procfile` và biến `process.env.PORT` sẵn sàng deploy cloud 24/7.

---

## 🛠️ CẤU TRÚC THƯ MỤC DỰ ÁN

```text
textmine/
├── data/
│   ├── accounts.json         # Lưu tài khoản đã lưu (Default: [])
│   └── shulkers.json         # Lưu dữ liệu rương Shulker Box (Default: [])
├── public/
│   ├── index.html            # Giao diện HTML5 (Sidebar Navigation Dọc)
│   ├── style.css             # CSS Dark Mode Glassmorphism & Terminal Box
│   └── app.js                # Frontend Logic, WebSocket Client, Canvas Engine
├── src/
│   ├── account_manager.js    # Quản lý tài khoản
│   ├── bot_manager.js        # Động cơ quản lý Multi-Bot Mineflayer
│   ├── builder_engine.js      # Điều hướng, đặt block thật và vòng lặp build
│   ├── letter_assignment.js   # Nhận diện chữ theo khoảng cách tới pixel
│   ├── time_utils.js          # Chuẩn hóa tick, ngày/đêm và đồng hồ HH:MM
│   ├── pixel_engine.js       # Phân tích ma trận pixel & tọa độ 3D
│   └── shulker_manager.js    # Quản lý rương Shulker box
├── Dockerfile                # Cấu hình đóng gói Docker
├── Procfile                  # Cấu hình chạy Heroku/Railway
├── railway.json              # Cấu hình deploy Railway
├── server.js                 # Server Express & Socket.io Realtime (Port 3000)
└── SYSTEM_FEATURES.md        # File tổng hợp chi tiết tính năng hệ thống
```

---
*Bản quyền tài liệu hệ thống THẤT NGHIỆP Auto-Builder.*
