# Emi House · Hệ thống thiết kế SaaS

Yêu cầu nâng cấp ngày 15/10/2026 thay thế hướng thiết kế một màu trước đây. Ưu tiên giúp chủ shop đọc được lợi nhuận, doanh thu, tổng chi và việc cần làm ngay.

## Ngôn ngữ thị giác

- Giữ thương hiệu Emi House và font Be Vietnam Pro; nền xanh tím rất nhẹ `#f5f7fc`, surface trắng, chữ navy `#24344d`.
- Emerald `#087f5b`: lợi nhuận, thao tác chính. Blue `#3b82f6`: doanh thu, đơn hàng. Purple `#8b5cf6`: Ads/phân tích. Teal `#0d9488`: kho/giá vốn. Amber `#f59e0b`: việc chờ xử lý. Rose `#e15478`: hoàn/lỗ/cảnh báo.
- Lợi nhuận là card ưu tiên; khi âm chuyển rose. Màu khác luôn đi kèm nhãn, số và icon, không truyền đạt chỉ bằng màu.
- Card radius 13–14px, border nhẹ; gradient chỉ dùng trên KPI chính và vùng chart. Số dùng tabular figures.

## Cấu trúc

- Tổng quan: biểu đồ doanh số theo giờ + Ads/CPA → biểu đồ thanh trạng thái + hai mục cần xử lý chỉ có số lượng → đơn gần đây. Không KPI lợi nhuận, cảnh báo tài chính hay bộ lọc kỳ.
- Hiệu quả bán hàng: chọn ngày chốt để xem kết quả hiện tại của cohort, doanh thu thực, lợi nhuận, tỷ lệ hoàn và CPA thành công. Còn đơn chờ kết quả thì chưa chốt lợi nhuận.
- Chi phí: thu–chi–lãi và Ads, sổ nhập tay cạnh phân rã tự động.
- Đơn hàng: tabs đếm theo kỳ, tìm bằng mã/SĐT/SPX/SKU, sao chép SPX, đổi trạng thái trực tiếp, drawer ngữ cảnh.
- Kho: một checkbox “Đã nhập cả đợt” xác nhận tất cả SKU còn thiếu trong một lần lưu. Không yêu cầu tick từng sản phẩm. Hàng đã nhập không bị tính lại; đơn mới thiếu hàng hình thành đợt tiếp theo.

## Responsive & tương tác

- Desktop 3 cột KPI, 2 cột biểu đồ; điện thoại 2 cột KPI, lợi nhuận đầu hàng, chart một cột.
- Bảng đơn thành thẻ ở màn hình nhỏ, các bảng số liệu khác cuộn trong panel; không cuộn ngang toàn trang.
- Chart có tooltip bằng chuột/chạm/phím mũi tên. Form dùng nhãn, validation, trạng thái lưu. Drawer hỗ trợ Escape, quản lý focus và trap Tab khi là overlay.
- Giảm chuyển động khi `prefers-reduced-motion`.

## Nguồn số liệu

Không thêm dữ liệu minh họa. Tất cả card, chart, badge, cảnh báo và trạng thái lấy từ `/api/shop`. Không hiển thị tăng trưởng khi kỳ so sánh không có dữ liệu. Thiếu mẫu số hiển thị “—”. Không gọi giá trị đơn chốt là doanh thu đã giao.
