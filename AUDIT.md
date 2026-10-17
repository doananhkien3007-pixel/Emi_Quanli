# Audit và nâng cấp Emi House · 15/10/2026

## Hiện trạng và xử lý

| Vấn đề phát hiện | Thay đổi |
| --- | --- |
| Tổng quan gọi giá trị đơn mới là doanh thu | Tổng quan chỉ có hoạt động hôm nay; lợi nhuận chuyển sang Hiệu quả bán hàng |
| Báo cáo cũ lấy theo ngày chốt, trừ cả vốn đơn chưa giao | Hiệu quả bán hàng quy kết kết quả hiện tại về ngày chốt; vốn chỉ tính đơn thành công |
| Hoàn sau giao có thể làm mất doanh thu lịch sử | Cohort loại doanh thu/vốn của đơn hoàn; giữ phí vận chuyển và phí hoàn của nhóm ngày chốt |
| Excel không có ngày giao/hoàn/gửi | Không backfill ngày giả. Tổng quan không đếm sự kiện thiếu ngày; cohort vẫn quy kết trạng thái hiện tại về ngày chốt |
| Phí về kho chưa ngày bị bỏ sót ở bộ lọc | Tính trong Tất cả và cảnh báo ở các kỳ khác |
| ROAS dùng giá trị đơn chốt, không có attribution | Hiển thị Doanh thu / chi Ads, nói rõ là tỷ số vận hành |
| Cảnh báo mở danh sách với bộ lọc ngày hiện tại | Hàng đợi dùng tất cả thời gian; filter hoàn chỉ lấy đơn chưa nhận hàng |
| Không tìm/copy mã vận đơn | Search bao gồm SPX, màu, size; copy tại bảng và drawer |
| Kho cấp tồn cho đơn đã lấy từ xưởng hoặc đã gửi | Không phân bổ thêm cho đơn đã đủ hàng/đã gửi; dùng đúng sản phẩm + màu + size |
| Nhập theo đợt phải thao tác nhiều dòng | Một checkbox xác nhận toàn bộ thiếu hụt hiện tại, lưu nguyên tử một request |
| Chỉnh/xóa đơn nguồn hàng hoàn có thể làm mất lịch sử tồn | API giữ lịch sử SKU/số lượng, cho đổi Hoàn/Hủy và rollback nguồn còn khả dụng; chặn thu hồi nguồn đã xuất đi trên đơn khác |
| Đổi phí mặc định làm biến động báo cáo cũ | Snapshot phí ship, phí hoàn và tỷ lệ phụ phí Ads của bản ghi hiện có trước thay đổi defaults |
| GET tạo tài khoản mới bằng toàn bộ seed khách hàng của shop | Tài khoản mới bắt đầu rỗng. Giữ nguyên row đã tồn tại; thêm sản phẩm để bắt đầu sử dụng |
| Một trang dashboard lớn trộn tính toán/presentation | Tách analytics, schema/update validation, các panel tài chính và chart tương tác |

## Database và tương thích

Giữ bảng D1 `shops(owner TEXT PRIMARY KEY, data TEXT, revision INTEGER)`. Không DROP, TRUNCATE hoặc đổi khóa owner. Ghi bằng compare-and-swap revision, trả 409 khi có thay đổi đồng thời. Schema kiểm tra ngày, tiền không âm, ID trùng và nguồn tồn.

Các trường thêm đều optional: `shipped_at`, `updated_at`, `returnShippingFee`, `adFeeRate`, `settings.returnRateThreshold`. Các bản ghi cũ vẫn đọc được. `db/seed.json` được giữ nguyên để đối chiếu Excel, không còn tự sao chép sang tài khoản khác. `metrics()` cũ chỉ giữ làm phép đối chiếu nguồn; UI dùng `financialMetrics()`.

Không thay phiên đăng nhập hoặc cơ chế giới hạn audience của Sites. API vẫn phụ thuộc proxy Sites để xác thực header ở production. Local dev chỉ có phiên mô phỏng trên loopback.

## Quy tắc tài chính

- Doanh thu = giá trị đơn đã giao trong kỳ − khoản hoàn của đơn từng giao trong kỳ hoàn.
- Giá vốn = vốn của đơn giao trong kỳ − vốn đảo lại khi đơn đã giao bị hoàn; hàng hoàn vẫn là tài sản hàng hóa, tự vào tồn theo trạng thái Hoàn, ưu tiên cho các đơn đang chờ.
- Phí ship tính khi gửi; phí hoàn khi hoàn; Ads, Grab, chi phí khác theo ngày chi. Phụ phí Ads làm tròn theo từng khoản để tổng chart khớp tổng kỳ.
- Lợi nhuận = doanh thu − giá vốn − Ads − ship − hoàn − phụ phí Ads − Grab − khoản khác.
- Giá bán/vốn từng dòng là thành tiền dòng, không nhân số lượng lần nữa.
- Tỷ lệ hoàn = số đơn hiện tại Hoàn / (Thành công + Hoàn), thuộc nhóm đơn chốt trong khoảng chọn. Không trộn denominator này với số sự kiện giao trong ngày. Ngưỡng mặc định 15% là ngưỡng theo dõi có thể chỉnh, không phải benchmark ngành.
- Thiếu ngày, thiếu vốn hoặc phí chưa có ngày: lợi nhuận tạm tính. Lợi nhuận ghi nhận không đồng nghĩa số dư tiền mặt/COD đã đối soát.
- Khoảng dài chia tối đa 90 nhóm liên tục, gồm ngày không phát sinh; không cắt bỏ dữ liệu. Chi phí chưa ngày không tự phân bổ vào chart.

## Phạm vi và giới hạn

- Chưa có kết nối tự động Facebook Ads, SPX/COD, attribution, bút toán đối soát, mất/hỏng hàng hoặc hoàn một phần. Các chi phí phát sinh ngoài dữ liệu nhập vẫn cần nhập tay.
- Bảng JSON theo owner phù hợp quy mô shop hiện tại. Nếu tăng nhiều người cùng thao tác hoặc hàng chục nghìn đơn, nên chuyển dần sang bảng order/item/expense/stock movement và API theo thao tác, có migration và backup riêng.
- Dòng nhập xưởng hiện là số lượng đáp ứng đơn đang chờ; không phải chứng từ mua hàng/nợ xưởng. Batch tick không tự phát sinh khoản tiền chi hay nhân đôi giá vốn.
- Nhập hàng hoàn và phân bổ tồn có bảo vệ lịch sử; chưa có quy trình kế toán sửa chứng từ kho đã chốt. Không xóa nguồn kho để sửa số liệu.
- Tài khoản và dữ liệu đã tồn tại được giữ nguyên; chưa có UI import Excel mới/restore JSON. Tài khoản mới có thể thêm danh mục rồi tạo đơn.

## Kiểm chứng

- `node scripts/check-metrics.mjs`: đối chiếu số liệu Excel cũ và regression kho.
- `node scripts/check-business.mjs`: các tình huống doanh thu theo sự kiện, hoàn sau giao, denominator rỗng, chart cộng đúng, fallback, stock FIFO/SKU, batch nhập một lần, validation, phí lịch sử, timestamp và múi giờ Việt Nam.
- `npx tsc --noEmit` và `npm run build`.
- Browser QA: desktop 1440px và mobile 390px; không tràn ngang mobile; cảnh báo hoàn mở đúng queue, drawer, menu và analytics. Không có warning/error JS trong các luồng đã xem.
- Production publication chưa thực hiện: `get_site` với project_id trong `.openai/hosting.json` trả `NOT_FOUND`. Không tạo site mới hoặc thay identity để né lỗi này.

### Kho theo đơn đặt (cập nhật)

- Tồn theo SKU dùng trước; đợt nhập chỉ gồm phần thiếu và gắn trực tiếp cho đơn.
- Hoàn tự tạo đúng một nguồn tồn, rời Hoàn thu hồi nguồn. Hủy trả phần giữ từ tồn và phần đã nhập xưởng về kho.
- Lịch sử nhập xưởng không bị xóa khi hủy; allocations do server tính, không tin số lượng từ client.
- Rollback nguồn đã giữ cho đơn chờ sẽ trả phần thiếu về Cần nhập. Nếu đã xuất cho đơn khác thì chặn rollback đến khi xử lý đơn sử dụng.
- `node scripts/check-inventory.mjs`: 10 tình huống vòng đời, gồm đa SKU, một phần từ tồn, nhập lặp, hoàn lặp, rollback, hủy, mở lại, bảo vệ chứng từ.
