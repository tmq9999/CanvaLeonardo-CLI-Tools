# Local Canva credential vault

## Goal

Store Canva account metadata and MFA material locally for the team desktop/WebUI replacement without exposing plaintext secrets in logs, source control, or ordinary CLI output.

## Storage

- Local SQLite database: `data/canva-vault.sqlite`, ignored by Git.
- Encryption key: `TOTP_VAULT_MASTER_KEY` in `.env`, base64 encoded 32 bytes.
- AES-256-GCM encrypts each sensitive value independently with a random 12-byte IV and 16-byte authentication tag.
- Tables: `accounts` (email, display name, team, MFA state, timestamps) and `account_secrets` (account relation, secret type, ciphertext, IV, tag, key version).

## MFA capture

The MFA flow captures a user-authorized TOTP secret only after the vault is initialized. It writes the encrypted secret directly to the vault and reports only a success status. Recovery codes use the same encrypted storage path when explicitly requested.

## Boundaries

- No plaintext TOTP secrets, recovery codes, master keys, passwords, or OTPs in logs, CLI args, tests, source control, or chat output.
- No online service or remote database.
- The future local WebUI accesses data through a vault service API; it does not read raw SQLite blobs directly.
