# Custom Mail OTP Integration Design

## Goal

Add a `Custom Mail` option to the Settings mail menu. The option stores one fixed mailbox address and exposes a reusable client for reading OTP messages from the existing Cloudflare Worker at `https://tempmail.benobaty.online`.

This change does not add a signup/login workflow. It provides the configuration and service boundary that future workflows can call.

## Scope and non-goals

In scope:

- Add `custom` to the typed mail-service choices.
- Persist a validated fixed email address in `config.json`.
- Keep the Worker base URL in typed application configuration with the production default; it is not exposed as a credential field in Settings.
- Add a typed HTTP client for health, message listing, and latest-OTP polling.
- Unit-test configuration migration, prompt behavior, request construction, response parsing, retry, and error handling.

Out of scope:

- A new Canva signup/login flow.
- Cloudflare deployment or Worker source changes.
- Reading or storing Cloudflare API tokens or `VIEW_TOKEN` in application config.
- Browser automation for mail verification.

## Configuration

`ServiceMail` becomes:

```ts
type ServiceMail = "hotmail-outlook" | "adguard-mail" | "gmail" | "custom"
```

`AppConfig.general` gains:

```ts
customMail: {
    address: string
    workerUrl: string
}
```

The default is an empty address and `https://tempmail.benobaty.online`. `loadConfig()` deep-merges this section so existing config files remain valid. Settings displays the current address, prompts for the address when `Custom Mail` is selected, validates a trimmed email, and saves it. The Worker URL is a fixed application default rather than a user-editable or secret field.

## Mail Worker client

Create a focused service module, for example `src/services/mail-worker.ts`, with dependency-injected `fetch` and timing so tests do not access the network.

The client receives the resolved custom-mail configuration and exposes:

```ts
health(): Promise<void>
listMessages(options?: ListMessagesOptions): Promise<MailMessage[]>
readLatestOtp(options?: ReadOtpOptions): Promise<string | null>
```

`readLatestOtp()` calls `/otp` with the configured mailbox, optional `after`, and `scan`, then retries when the response contains no OTP. Retry count and delay are caller options with conservative defaults. It returns `null` after polling is exhausted.

The client must:

- Build URLs with `URL`/`URLSearchParams` so mailbox addresses are encoded.
- Require a successful HTTP response.
- Validate the expected JSON shape before returning data.
- Preserve the Worker error status in thrown errors without logging secrets.
- Avoid sending a token because the public Worker API documented by the repository does not require one.

## Data flow

```text
Settings prompt
  -> AppConfig.general.customMail
  -> config.json
  -> loadConfig() in a future workflow
  -> MailWorkerClient
  -> GET /otp?mail=...&after=...&scan=...
  -> OTP string or null
```

## Error behavior

- Blank or malformed address: reject in the prompt and in the client constructor/config resolver.
- Worker unavailable or non-2xx response: throw a typed error containing URL-safe context and HTTP status.
- Invalid JSON or missing response fields: throw a protocol error.
- No OTP after retries: return `null`; callers decide whether to continue or abort.
- Existing non-custom mail configurations: retain their behavior and do not require the new fields to exist in the file.

## Tests and verification

- `config.test.ts` or the existing config test location: defaults, deep merge of old configs, save/load of custom address and URL, email validation.
- `mail-worker.test.ts`: URL encoding, `/health`, `/logs`, OTP parsing, retry, timeout/error response, and malformed payloads using mocked fetch and timers.
- Settings tests: custom option appears, address is requested, and the updated configuration is persisted.
- Run the full test suite and TypeScript build. Perform a read-only live health check only if network access is available; do not print response secrets or `.env` values.

## Security notes

The Cloudflare API token remains only in `.env`/the operator environment and is never copied into `config.json`, source, tests, logs, or the mail Worker request. Cloudflare secret values such as `VIEW_TOKEN` cannot be retrieved in plaintext through the API; only presence/configuration or endpoint behavior can be checked.
