# Custom Mail Faker Full Name Design

## Mục tiêu

Khi tạo lời mời Canva bằng `Service Mail = Custom Mail`, CLI có thể tự tạo cả mailbox lẫn tên hiển thị. Người vận hành không cần truyền `--email` hoặc `--name`.

## Hành vi

- Với `serviceMail === "custom"`:
  - Không có `--email`: giữ hành vi hiện có, tạo mailbox bằng `createCustomMailbox`.
  - Không có `--name`: tạo tên tiếng Anh bằng `faker.person.fullName()`.
  - Có `--name`: dùng nguyên tên do người vận hành truyền.
- Với Service Mail khác: `--email` và `--name` vẫn bắt buộc, không thay đổi flow hiện hữu.
- Tên được resolve một lần trước khi mở browser, sau đó dùng xuyên suốt cho bước điền form Canva và metadata account/vault hiện có.

## Thiết kế kỹ thuật

`CanvaInviteLoginArgs.name` trở thành optional ở parser. Parser nhận thêm cờ `allowGeneratedName`, tương tự `allowGeneratedEmail`. Hàm `runCanvaInviteLogin` tải config rồi xác định `name`:

```ts
const name = config.general.serviceMail === "custom"
  ? args.name ?? faker.person.fullName()
  : args.name
```

Nếu vì bất kỳ lý do nào tên không có ở luồng không-custom, runtime sẽ dừng bằng lỗi input an toàn trước khi mở browser. Khi Custom Mail sinh tên, CLI chỉ log trạng thái cho biết tên đã được sinh; không log OTP, token, password, TOTP secret hoặc recovery code.

## Kiểm thử

- Custom Mail parse thành công khi không có cả `--email` lẫn `--name`.
- Non-Custom Mail tiếp tục từ chối thiếu `--name`.
- `runCanvaInviteLogin` resolve một English full name khi Custom Mail không nhận tên, bằng generator được inject/mock để test deterministic.
- Full `npm test` và `npm run build` phải pass.

## Ngoài phạm vi

- Không thêm setting chọn locale.
- Không đổi họ tên bằng một tên tiếng Việt cụ thể.
- Không tự mở browser hay tạo lời mời Canva trong quá trình test feature này.
