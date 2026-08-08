# Canva Invite OTP Login Design

## Goal

Provide a standalone CLI script that joins an authorized Canva Business invitation using a supplied invite URL, employee email, display name, and the protected Cloudflare Worker OTP endpoint.

## Scope

The script accepts these command-line arguments:

```text
--invite <https Canva invitation URL>
--email <employee mailbox>
--name <display name>
```

It reads `CANVA_OTP_TOKEN` from the process environment and calls `https://tempmail.benobaty.online/api/canva/otp`. The token, OTP, and invitation token are never logged or committed.

The script uses the existing browser runtime and configuration so the selected Chromium, Camoufox, or GPM Login engine and configured proxy continue to apply. It is separate from the current interactive Start menu until the live flow has been verified.

## Flow

1. Validate the invite URL is HTTPS and belongs to Canva.
2. Load configuration and launch exactly one browser session through the existing runtime adapter.
3. Navigate to the invitation, identify the email and name inputs from stable accessible selectors, and enter the provided employee details.
4. Record an ISO timestamp immediately before triggering Canva's email verification request.
5. Poll the protected Worker endpoint with the mailbox and `after` timestamp. Use bounded retries with a short delay. Do not display the OTP.
6. Enter the OTP, continue the flow, and accept the Business invitation.
7. Confirm success from a Canva page state or canonical post-join URL, then close the session cleanly.

## Error handling and handoff

- Invalid input, missing `CANVA_OTP_TOKEN`, Worker HTTP failure, malformed OTP response, or polling timeout produces a Vietnamese error without sensitive data.
- CAPTCHA, unexpected identity-provider choice, security challenge, or a changed form stops automation with the browser left open for user takeover; it does not attempt bypasses.
- The script never retries a join submission after an ambiguous final response.

## Tests and live verification

- Unit-test CLI argument validation, Worker request construction, bounded OTP polling, and selector-driven page operations with fake page and fetch dependencies.
- Test that the request includes `after`, sends authorization only in the header, and never logs the OTP.
- Run TypeScript build and the full test suite.
- Live verification uses the supplied authorized Business invite, `strict.dinosaur.oxym@mask.me`, and `Nguyen Lan Anh`; only report final success/failure state and non-sensitive metadata.

## Non-goals

- Persisting Canva passwords, cookies, OTPs, or invite URLs.
- Bypassing CAPTCHA or other security checks.
- Modifying the existing interactive Start flow in this change.
