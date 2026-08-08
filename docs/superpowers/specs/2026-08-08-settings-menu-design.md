# Settings Menu Design

## Goal

Hoàn thiện menu Settings CLI hiện có, cho phép người dùng cấu hình các tham số chạy tool, proxy và browser. Cấu hình phải được lưu bền để tự động sử dụng ở các lần chạy sau.

## Scope

### In scope

- Đọc, ghi và khôi phục cấu hình từ `config.json` trong thư mục project.
- Giá trị mặc định:
  - Số luồng song song: `1`.
  - Thời gian chờ giữa thao tác: `0.5` giây.
  - GPM Login port: `9495`.
  - Browser hiển thị: bật.
  - Proxy: không dùng.
  - Camoufox: default.
- Menu con cho General, Proxy và Browser.
- Validation input trước khi lưu.
- Hỗ trợ danh sách Kiot Proxy key từ file `.txt` (mỗi dòng một key), hoặc danh sách proxy thường từ file `.txt` (mỗi dòng một proxy).
- Chọn Service Mail từ Hotmail/Outlook, Adguard Mail hoặc Gmail và lưu giá trị được chọn.
- Chọn browser GPM Login hoặc Camoufox.
- Camoufox Default hoặc Custom với các launch options được hỗ trợ trong khung hiện tại.

### Out of scope

- Thực thi worker/tool thật sau khi Settings hoàn tất.
- Gọi API Kiot Proxy hoặc kiểm tra proxy online.
- Tự động kiểm tra file proxy có tồn tại trong lúc chỉ hiển thị menu; chỉ validate đường dẫn và phần mở rộng khi lưu.
- Tạo UI đồ họa hoặc thêm framework config.

## Configuration model

```ts
type ProxyMode = "none" | "kiot" | "file"
type ServiceMail = "hotmail-outlook" | "adguard-mail" | "gmail"
type BrowserEngine = "gpm" | "camoufox"
type CamoufoxMode = "default" | "custom"

interface AppConfig {
  general: {
    parallelThreads: number
    operationDelaySeconds: number
    serviceMail: ServiceMail
    browserVisible: boolean
  }
  proxy: {
    mode: ProxyMode
    filePath: string
  }
  browser: {
    engine: BrowserEngine
    gpmPort: number
    camoufox: {
      mode: CamoufoxMode
      options: {
        geoip: boolean
        humanize: boolean
        blockWebRTC: boolean
        blockWebGL: boolean
        blockImage: boolean
      }
    }
  }
}
```

The persisted file is JSON and should be human-readable. New fields are merged with defaults when loading, so an older or partial config remains usable. Invalid JSON is handled by warning the user and falling back to defaults without crashing the CLI.

## Menu behavior

The top-level Settings menu keeps the existing four choices:

1. General settings.
2. Proxy settings.
3. Browser settings.
4. Exit.

Each submenu includes a Back choice. A completed submenu saves the updated config immediately. Exiting the top-level menu does not discard already-saved changes.

### General settings

- Prompt for parallel threads; integer greater than or equal to `1`.
- Prompt for operation delay; finite number greater than or equal to `0`.
- Select Service Mail: Hotmail/Outlook, Adguard Mail, or Gmail.
- Prompt whether browser windows should be visible.

### Proxy settings

- Select `None`, `Kiot Proxy`, or `Proxy file`.
- Kiot Proxy prompts for a path ending in `.txt`; each line is one Kiot Proxy key.
- Proxy file prompts for a path ending in `.txt`; each line is one HTTP proxy in the supported proxy format.
- The selected proxy mode determines how the same stored file path is parsed at runtime.
- Existing values are used as prompt defaults where possible.

### Browser settings

- Select GPM Login or Camoufox.
- GPM Login prompts for a port between `1` and `65535`, default `9495`.
- Camoufox selects Default or Custom.
- Custom exposes the existing boolean options: GeoIP, Humanize, Block WebRTC, Block WebGL, and Block Image.

## Persistence and error handling

- A dedicated config module owns the file path, defaults, load, merge, and save operations.
- Writes use UTF-8 JSON with indentation.
- Save errors are reported clearly and do not silently claim success.
- Load errors caused by missing files are normal and use defaults.
- Malformed JSON produces a warning and defaults; the malformed file is not deleted automatically.

## Integration boundary

`settings()` remains the CLI entry point. It obtains an `AppConfig` from the config module, passes the current values to prompts, and saves updates. Runtime consumers can later import the typed config loader without depending on Inquirer prompt code.

## Testing strategy

- Unit tests for default config shape and values.
- Unit tests for loading a missing file.
- Unit tests for merging partial persisted config with defaults.
- Unit tests for malformed JSON fallback.
- Unit tests for save/load round trip.
- Validation tests for thread count, delay, GPM port, Service Mail choice, and `.txt` proxy path.
- A CLI smoke test or manual verification covering all three submenus and Back/Exit behavior, subject to the project's available test setup.

## Acceptance criteria

- Running the CLI with no config creates usable defaults after the first saved change.
- Values entered in each submenu are visible as defaults on the next visit.
- Values remain available after the process exits and restarts.
- Invalid numeric values cannot be saved.
- Proxy mode-specific fields do not overwrite unrelated modes.
- Browser selection and Camoufox mode/options persist correctly.
- `npm run build` succeeds.
