# Canva Worker Preview Design

## Mục tiêu

Khi người dùng chọn `Bắt đầu`, ứng dụng hỏi invite link Canva, mở đúng số browser theo `general.parallelThreads`, điều hướng mỗi browser tới invite link và cho người dùng kiểm tra trực tiếp. Phiên bản này chưa chạy automation Canva sau bước mở link.

## Luồng người dùng

1. Menu chọn `Bắt đầu`.
2. Ứng dụng hiển thị `Nhập link invite canva: `.
3. Worker manager đọc config hiện tại và chuẩn bị proxy theo round-robin.
4. Tạo đúng số worker bằng browser engine/profile đã cấu hình.
5. `canva.ts` nhận session và invite URL, mở URL trên page.
6. Khi tất cả browser đã mở thành công, ứng dụng hiển thị hướng dẫn kiểm tra bằng tiếng Việt.
7. Người dùng nhấn Enter sau khi xác nhận browser đúng.
8. Ứng dụng đóng browser, release các Kiot key và quay lại menu.

Không có promise chờ vô hạn và không chạy bước Canva tiếp theo trong phiên bản này.

## Kiến trúc

### `src/core/canva.ts`

Chứa task preview tối thiểu, nhận `BrowserSession` và invite URL, gọi `page.goto()` qua contract page cần thiết. Module chỉ chịu trách nhiệm mở URL và log kết quả bằng `logger`.

### `src/core/workers.ts`

Điều phối worker preview:

- đọc `AppConfig`;
- tạo adapter bằng `createRuntimeAdapter()`;
- lấy danh sách proxy/key;
- chọn proxy theo `workerIndex % proxyCount`;
- launch browser, gọi task Canva và giữ các session trong bộ nhớ cho tới khi người dùng nhấn Enter;
- đóng tất cả session và release Kiot key trong cleanup, kể cả khi launch hoặc task thất bại.

### `src/utils/menu.ts`

Thay callback runtime hiện tại bằng flow hỏi invite URL, gọi worker manager, và dùng `logger` cho output mới. Các lỗi được hiển thị bằng thông báo tiếng Việt.

## Proxy round-robin

Với proxy file, mọi entry hợp lệ được normalize một lần và phân phối vòng tròn. Số entry có thể ít hơn, bằng hoặc nhiều hơn số worker.

Với Kiot key, entry cũng được chọn vòng tròn. Mỗi lần entry được dùng để mở worker, hệ thống thử gọi `/proxies/new`. Response metadata phải giữ `ttc` nếu có. Khi chưa tới thời gian đổi proxy (`ttc > 0` hoặc API từ chối vì countdown), hệ thống gọi `/proxies/current` và dùng proxy hiện tại. Lỗi key không hợp lệ, response thiếu `data.http`, hoặc lỗi mạng không được coi là countdown fallback.

Các key đã dùng trong phiên được release tối đa một lần khi kết thúc. Không log giá trị key hoặc thông tin xác thực proxy.

## Lỗi và cleanup

- Invite URL rỗng hoặc không hợp lệ: báo lỗi tiếng Việt, không launch worker.
- Danh sách proxy rỗng khi proxy mode không phải `none`: báo lỗi trước khi launch.
- Một worker launch thất bại: log worker index, đóng các session đã mở và release proxy resources.
- Một task mở URL thất bại: cleanup toàn bộ phiên và báo lỗi chính.
- Cleanup failure không che khuất lỗi chính.
- Nhấn Enter sau khi preview: đóng toàn bộ browser và release resource rồi quay lại menu.

## Kiểm thử

Unit tests phải bao phủ:

- `canva.ts` truyền đúng invite URL tới page;
- số worker bằng `parallelThreads`;
- round-robin khi proxy ít hơn và nhiều hơn worker;
- Kiot đổi proxy mới khi được phép;
- Kiot fallback current khi `ttc > 0` hoặc countdown rejection;
- cleanup mọi session và release key sau khi người dùng xác nhận;
- launch/task failure vẫn cleanup đúng.

## Ngoài phạm vi

- Không tự động đăng ký, tạo thiết kế, xử lý email hoặc thao tác Canva khác.
- Không thay đổi settings schema ngoài những gì đang có.
- Không thay đổi adapter browser riêng lẻ nếu contract hiện tại đủ dùng.
