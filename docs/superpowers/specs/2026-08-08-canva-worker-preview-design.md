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

## Kiểm thử và verification bắt buộc

Verification phải chạy live end-to-end với stack thật và browser thật. Không được dùng `npm test` hoặc `npm run build` làm bước xác nhận hoàn thành; hai lệnh này bị cấm trong quy trình verification của feature này.

Kịch bản bắt buộc:

1. Cấu hình `general.parallelThreads = 3`.
2. Chọn proxy/browser settings thực tế đang cần kiểm tra.
3. Chọn menu `Bắt đầu`.
4. Nhập chính xác URL `https://canva.com/`.
5. Xác nhận hệ thống tạo đủ 3 worker và mở đủ 3 browser thật.
6. Xác nhận cả 3 browser đều điều hướng tới `https://canva.com/` thành công và nhận response thành công từ trang đích.
7. Chụp/ghi lại output thực tế của từng worker, URL cuối cùng và response status; không chấp nhận kết quả chỉ dựa trên log giả hoặc mock.
8. Sau khi người dùng kiểm tra, nhấn Enter để xác nhận cleanup; xác nhận cả 3 browser đóng và proxy/Kiot resource được xử lý đúng.

Chỉ được báo hoàn thành khi cả 3 worker/browser truy cập `https://canva.com/` thành công trong lần chạy live này. Nếu thiếu browser, điều hướng lỗi, response lỗi, hoặc chưa có evidence runtime thật thì phải báo chưa hoàn thành.

## Ngoài phạm vi

- Không thay đổi settings schema ngoài những gì đang có.
- Không thay đổi adapter browser riêng lẻ nếu contract hiện tại đủ dùng.
