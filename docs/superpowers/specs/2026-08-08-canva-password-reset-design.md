# Canva password reset from General Settings

## Goal

After an authorized Canva Business invitation is accepted, set the account password through Canva's password-reset flow. The desired password is controlled from the application's General Settings rather than command-line arguments.

## Configuration

Add `general.canvaPassword` to `AppConfig` as an optional local string.

- Settings > General adds **Mật khẩu Canva**.
- The settings menu uses a masked password prompt and displays only `Đã đặt` or `Mặc định` in its list.
- A blank setting means the runtime uses the fallback password approved by the operator. The literal fallback is kept in implementation only and never printed.
- A configured password is written to the local `config.json`; it is not placed in CLI arguments, logs, test output, or documentation.

## Runtime flow

The invite CLI remains the orchestration entry point. Once the invite succeeds, it invokes a separate password-reset state machine using the same browser session and mailbox:

1. Navigate to `https://www.canva.com/login/reset`.
2. Fill the invited account's email and submit the reset request.
3. Record the timestamp immediately before sending the request.
4. Poll the protected Worker for a new Canva OTP for that mailbox.
5. Fill the OTP, handling Canva's auto-submit behavior.
6. Fill and confirm the configured password, then submit the reset form.
7. Treat a known success state or navigation away from reset as success. On CAPTCHA, security review, or unknown UI, raise a Vietnamese handoff error and leave the visible browser open.

The reset step does not configure, read, display, or disable TOTP/2FA or recovery codes. Those remain outside this flow.

## Components

- `src/core/config.ts`: config type/default/merge support for the optional password.
- `src/cli/settings.ts`: masked General Settings input and masked status label.
- `src/core/canva-password-reset.ts`: selector-based reset state machine, independent from invite UI.
- `src/cli/canva-invite-login.ts`: reads the local configured/fallback password and runs reset after a successful invite.

## Testing

- Config merging preserves an explicitly configured password and supplies no plaintext to status labels.
- Settings dependencies verify that a password is persisted without displaying it.
- Reset state-machine tests cover request timestamp, Worker OTP ordering, password confirmation, auto-submitted OTP, success navigation, and handoff states.
- CLI tests ensure password values never appear in parser errors or lifecycle logs.

## Boundaries

- Only the user-authorized Canva invite, mailbox, and local configuration are in scope.
- No CAPTCHA bypass, 2FA bypass, TOTP extraction, recovery-code extraction, or password logging.
