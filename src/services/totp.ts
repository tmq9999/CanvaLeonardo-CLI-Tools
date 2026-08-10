import { TOTP } from "otpauth"

const BASE32_SECRET = /[A-Z2-7]{16,}/g

export function extractCanvaTotpSecret(secretFieldText: string): string {
    const secrets = Array.from(secretFieldText.toUpperCase().matchAll(BASE32_SECRET), match => match[0])
    if (secrets.length !== 1) throw new Error("Expected exactly one TOTP secret in the dedicated Canva field")
    return secrets[0]
}

export function generateTotp(secret: string, now = Date.now()): string {
    return new TOTP({ secret, algorithm: "SHA1", digits: 6, period: 30 }).generate({ timestamp: now })
}
