# Emi House

SaaS quản lý bán hàng tiếng Việt: dashboard thu–chi–lãi, đơn hàng, kho theo SKU, nhập hàng theo đợt, analytics và sổ chi phí. Vinext / React, Cloudflare D1; phiên đăng nhập và giới hạn truy cập qua Sites.

## Chạy tại máy

- `npm run dev`: bản xem trước tại `http://127.0.0.1:5173`.
- `/signin-with-chatgpt?return_to=/`: đăng nhập mô phỏng, chỉ trên localhost.
- `node scripts/check-metrics.mjs`: đối chiếu Excel và regression kho cũ.
- `node scripts/check-business.mjs`: kiểm tra nghiệp vụ tài chính, kho, batch và validation.
- `npm run check:meta-ads`: kiểm tra dải ngày Việt Nam và ánh xạ lịch Cron đồng bộ Meta Ads.
- `node scripts/check-inventory.mjs`: kiểm tra vòng đời tồn/nhập/hoàn/hủy/rollback qua validation của server.
- `npx tsc --noEmit`: kiểm tra TypeScript.
- `npm run build`: build production.

## Cách dùng

Tổng quan chỉ hiển thị hoạt động hôm nay: doanh số đơn chốt theo giờ Việt Nam, Ads, CPA (Ads / đơn chốt), số lượng và doanh số đơn mới/giao thành công/hoàn, hai danh sách cần xử lý và đơn hàng gần đây. Giao/hoàn theo ngày phát sinh thực tế, không suy đoán ngày cho dữ liệu lịch sử. Hiệu quả bán hàng tính doanh thu thực, lợi nhuận và phí đơn hàng theo nhóm ngày chốt; Ads và chi phí chung theo ngày chi. Nhóm còn đơn chưa có kết quả được ghi là tạm tính.

Trong Kho hàng, kiểm tra số sản phẩm/SKU/đơn còn thiếu rồi tick **Đã nhập cả đợt** một lần. Tồn đúng sản phẩm + màu + size được dùng trước; hàng xưởng chỉ nhập phần thiếu và gắn trực tiếp cho đơn. Chuyển Hoàn tự cộng tồn một lần; đổi khỏi Hoàn thu hồi phần đã cộng. Hủy đơn giải phóng hàng tồn đã giữ và chuyển hàng đã nhập xưởng thành tồn khả dụng. Đơn gửi rồi không được đưa lại vào đợt cần nhập. Nếu nguồn tồn đã được dùng cho đơn khác đang gửi/đã giao, cần xử lý đơn đó trước khi rollback nguồn để tránh mất lịch sử xuất hàng.

Trong Cài đặt, khoản vận chuyển về kho chưa có ngày được tính ở Tất cả. Thay đổi phí mặc định không đổi phí của bản ghi cũ.

## Dữ liệu

Dữ liệu lưu riêng theo owner trong D1; API kiểm tra revision trước mỗi lần ghi. Các row hiện có được giữ nguyên. Tài khoản mới bắt đầu rỗng và có thể thêm sản phẩm trước khi tạo đơn; không sao chép dữ liệu khách hàng của shop khác.

`db/seed.json` là dữ liệu Excel lịch sử để đối chiếu (50 đơn, 61 dòng sản phẩm, 9 khoản Ads), không dùng làm dữ liệu giả trên UI và không được chia sẻ công khai. Database preview và production độc lập.

## Đồng bộ Meta Ads trên Vercel

Chạy migration Supabase `202610210002_meta_ad_spend_daily.sql`, sau đó cấu hình các biến server-only trong Vercel: `META_ACCESS_TOKEN` (Secret), `META_AD_ACCOUNT_ID`, `CRON_SECRET` (Secret), cùng các biến Supabase hiện có. Không dùng tiền tố `NEXT_PUBLIC_` cho token. Tài khoản quảng cáo phải dùng tiền tệ VND và timezone `Asia/Ho_Chi_Minh` (Meta cũng có thể trả tên cũ `Asia/Saigon`).

Vercel Cron chỉ gọi `/api/cron/meta-ads` lúc 00:10 giờ Việt Nam để chốt hôm qua và backfill ba ngày đã hoàn tất gần nhất. Lịch `10 17 * * *` trong `vercel.json` dùng UTC. Trên dashboard, nút **Ads · tự động 30 phút** đồng bộ ngay ngày hiện tại và tự gọi lại mỗi 30 phút khi trang đang mở; chu kỳ này không dùng Vercel Cron. Khi Meta hoặc database lỗi, route ghi log có cấu trúc vào Vercel Logs và không sửa dữ liệu cũ. Với ngày đã đồng bộ, chi phí Meta thay thế khoản Ads nhập tay cùng ngày để tránh cộng trùng; các ngày chưa đồng bộ vẫn dùng chi phí nhập tay.

Xuất CSV theo bộ lọc hoặc sao lưu JSON trong Cài đặt. Chưa hỗ trợ tự đồng bộ SPX, COD đối soát hoặc import Excel mới.

Xem `AUDIT.md` cho quy tắc ghi nhận, phạm vi, giới hạn và kiểm chứng; `DESIGN.md` cho hệ thống giao diện.
