import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { ExportedCookie } from "../core/cookie-export.js"
import type { LeonardoUserDetails } from "../core/leonardo.js"

type Encrypted = { ciphertext: Buffer; iv: Buffer; tag: Buffer }

export interface AccountSummary {
    id: number
    email: string
    displayName: string | null
    team: string | null
    mfaEnabledAt: string | null
    leonardoUserId: string | null
    leonardoUsername: string | null
    leonardoEmail: string | null
    leonardoPlan: string | null
    leonardoSubscriptionSource: string | null
    leonardoSubscriptionTokens: number | null
    leonardoPaidTokens: number | null
    leonardoRolloverTokens: number | null
    leonardoApiCredit: number | null
    leonardoTokenRenewal: string | null
    leonardoBlocked: boolean
    leonardoCreatedAt: string | null
    status: string
    createdAt: string
    updatedAt: string
}

export class LocalCanvaVault {
    private readonly db: DatabaseSync
    private readonly key: Buffer

    constructor(databasePath = resolve("data/canva-vault.sqlite"), masterKey = process.env.TOTP_VAULT_MASTER_KEY ?? readVaultKeyFromEnv()) {
        if (!masterKey) throw new Error("Thiếu TOTP_VAULT_MASTER_KEY")
        this.key = Buffer.from(masterKey, "base64")
        if (this.key.length !== 32) throw new Error("TOTP_VAULT_MASTER_KEY phải là base64 của 32 bytes")
        mkdirSync(dirname(databasePath), { recursive: true })
        this.db = new DatabaseSync(databasePath)
        this.initSchema()
    }

    // ────────────────────────────────────────────────────────────
    // TOTP & Recovery (existing)
    // ────────────────────────────────────────────────────────────

    storeTotpSecret(email: string, secret: string, displayName?: string, team?: string): void {
        this.storeSecret(email, "totp", secret, displayName, team)
    }

    getTotpSecret(email: string): string {
        return this.getSecret(email, "totp")
    }

    storeRecoveryCodes(email: string, codes: string[]): void {
        const normalizedCodes = codes.map(code => code.trim()).filter(Boolean)
        if (normalizedCodes.length === 0) throw new Error("Cần ít nhất một recovery code")
        this.storeSecret(email, "recovery_codes", JSON.stringify(normalizedCodes))
    }

    getRecoveryCodes(email: string): string[] {
        const codes = JSON.parse(this.getSecret(email, "recovery_codes"))
        if (!Array.isArray(codes) || !codes.every(code => typeof code === "string")) throw new Error("Recovery codes trong vault không hợp lệ")
        return codes
    }

    // ────────────────────────────────────────────────────────────
    // Canva Password (new)
    // ────────────────────────────────────────────────────────────

    storeCanvaPassword(email: string, password: string): void {
        this.storeSecret(email, "canva_password", password)
    }

    getCanvaPassword(email: string): string {
        return this.getSecret(email, "canva_password")
    }

    // ────────────────────────────────────────────────────────────
    // Leonardo Info (new)
    // ────────────────────────────────────────────────────────────

    storeLeonardoInfo(email: string, details: LeonardoUserDetails): void {
        const normalized = email.trim().toLowerCase()
        this.ensureAccount(normalized)
        this.db.prepare(`UPDATE accounts SET
            leonardo_user_id = ?, leonardo_username = ?, leonardo_email = ?,
            leonardo_plan = ?, leonardo_subscription_source = ?,
            leonardo_subscription_tokens = ?, leonardo_paid_tokens = ?,
            leonardo_rollover_tokens = ?, leonardo_api_credit = ?,
            leonardo_token_renewal = ?, leonardo_blocked = ?,
            leonardo_created_at = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE email = ?`).run(
            details.id, details.username, details.auth0Email,
            details.plan, details.subscriptionSource,
            details.subscriptionTokens, details.paidTokens,
            details.rolloverTokens, details.apiCredit,
            details.tokenRenewalDate, details.blocked ? 1 : 0,
            details.createdAt, normalized
        )
    }

    // ────────────────────────────────────────────────────────────
    // Cookies (new)
    // ────────────────────────────────────────────────────────────

    storeCookies(email: string, domain: "canva" | "leonardo", cookies: ExportedCookie[]): void {
        const normalized = email.trim().toLowerCase()
        this.ensureAccount(normalized)
        const account = this.db.prepare("SELECT id FROM accounts WHERE email = ?").get(normalized) as { id: number }
        const encrypted = this.encrypt(JSON.stringify(cookies))
        this.db.prepare(`INSERT INTO account_cookies (account_id, cookie_domain, cookies_json, iv, tag, exported_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(account_id, cookie_domain) DO UPDATE SET
            cookies_json=excluded.cookies_json, iv=excluded.iv, tag=excluded.tag,
            exported_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP`
        ).run(account.id, domain, encrypted.ciphertext, encrypted.iv, encrypted.tag)
    }

    getCookies(email: string, domain: "canva" | "leonardo"): ExportedCookie[] {
        const normalized = email.trim().toLowerCase()
        const row = this.db.prepare(`SELECT c.cookies_json, c.iv, c.tag
            FROM account_cookies c JOIN accounts a ON a.id = c.account_id
            WHERE a.email = ? AND c.cookie_domain = ?`).get(normalized, domain) as { cookies_json: Buffer; iv: Buffer; tag: Buffer } | undefined
        if (!row) throw new Error(`Không có cookies ${domain} trong vault cho account này`)
        const decipher = createDecipheriv("aes-256-gcm", this.key, row.iv)
        decipher.setAuthTag(row.tag)
        const json = Buffer.concat([decipher.update(row.cookies_json), decipher.final()]).toString("utf8")
        return JSON.parse(json)
    }

    // ────────────────────────────────────────────────────────────
    // Account Management (new — for future tool)
    // ────────────────────────────────────────────────────────────

    getAccountSummary(email: string): AccountSummary | null {
        const row = this.db.prepare("SELECT * FROM accounts WHERE email = ?").get(email.trim().toLowerCase()) as Record<string, unknown> | undefined
        return row ? mapAccountRow(row) : null
    }

    listAccounts(): AccountSummary[] {
        const rows = this.db.prepare("SELECT * FROM accounts ORDER BY updated_at DESC").all() as Record<string, unknown>[]
        return rows.map(mapAccountRow)
    }

    clearAllData(): void {
        this.db.exec("DELETE FROM account_cookies; DELETE FROM account_secrets; DELETE FROM accounts;")
    }

    close(): void { this.db.close() }

    // ────────────────────────────────────────────────────────────
    // Private Methods
    // ────────────────────────────────────────────────────────────

    private initSchema(): void {
        // Original tables
        this.db.exec(`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT, team TEXT, mfa_enabled_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS account_secrets (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id), secret_type TEXT NOT NULL, ciphertext BLOB NOT NULL, iv BLOB NOT NULL, tag BLOB NOT NULL, key_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(account_id, secret_type));`)

        // Migration: Add Leonardo columns to accounts (safe — ALTER TABLE IF NOT EXISTS via try/catch)
        const leonardoColumns = [
            "leonardo_user_id TEXT",
            "leonardo_username TEXT",
            "leonardo_email TEXT",
            "leonardo_plan TEXT",
            "leonardo_subscription_source TEXT",
            "leonardo_subscription_tokens INTEGER",
            "leonardo_paid_tokens INTEGER",
            "leonardo_rollover_tokens INTEGER",
            "leonardo_api_credit REAL",
            "leonardo_token_renewal TEXT",
            "leonardo_blocked INTEGER DEFAULT 0",
            "leonardo_created_at TEXT",
            "status TEXT DEFAULT 'active'"
        ]
        for (const column of leonardoColumns) {
            try { this.db.exec(`ALTER TABLE accounts ADD COLUMN ${column}`) }
            catch { /* column already exists — safe to ignore */ }
        }

        // New table: account_cookies
        this.db.exec(`CREATE TABLE IF NOT EXISTS account_cookies (
            id INTEGER PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES accounts(id),
            cookie_domain TEXT NOT NULL,
            cookies_json BLOB NOT NULL,
            iv BLOB NOT NULL,
            tag BLOB NOT NULL,
            key_version INTEGER NOT NULL DEFAULT 1,
            exported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, cookie_domain)
        );`)
    }

    private ensureAccount(normalizedEmail: string): void {
        this.db.prepare(
            "INSERT INTO accounts (email, updated_at) VALUES (?, CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET updated_at=CURRENT_TIMESTAMP"
        ).run(normalizedEmail)
    }

    private storeSecret(email: string, type: string, value: string, displayName?: string, team?: string): void {
        const normalized = email.trim().toLowerCase()
        if (!normalized || !value.trim()) throw new Error("Email và secret là bắt buộc")
        this.db.prepare("INSERT INTO accounts (email, display_name, team, mfa_enabled_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET display_name=COALESCE(excluded.display_name, accounts.display_name), team=COALESCE(excluded.team, accounts.team), mfa_enabled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP").run(normalized, displayName ?? null, team ?? null)
        const account = this.db.prepare("SELECT id FROM accounts WHERE email = ?").get(normalized) as { id: number }
        const encrypted = this.encrypt(value.trim())
        this.db.prepare("INSERT INTO account_secrets (account_id, secret_type, ciphertext, iv, tag, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(account_id, secret_type) DO UPDATE SET ciphertext=excluded.ciphertext, iv=excluded.iv, tag=excluded.tag, updated_at=CURRENT_TIMESTAMP").run(account.id, type, encrypted.ciphertext, encrypted.iv, encrypted.tag)
    }

    private getSecret(email: string, type: string): string {
        const row = this.db.prepare(`SELECT s.ciphertext, s.iv, s.tag
            FROM account_secrets s JOIN accounts a ON a.id = s.account_id
            WHERE a.email = ? AND s.secret_type = ?`).get(email.trim().toLowerCase(), type) as { ciphertext: Buffer; iv: Buffer; tag: Buffer } | undefined
        if (!row) throw new Error(`Không có ${type} trong vault cho account này`)
        const decipher = createDecipheriv("aes-256-gcm", this.key, row.iv)
        decipher.setAuthTag(row.tag)
        return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8")
    }

    private encrypt(value: string): Encrypted {
        const iv = randomBytes(12)
        const cipher = createCipheriv("aes-256-gcm", this.key, iv)
        return { ciphertext: Buffer.concat([cipher.update(value, "utf8"), cipher.final()]), iv, tag: cipher.getAuthTag() }
    }
}

function mapAccountRow(row: Record<string, unknown>): AccountSummary {
    return {
        id: Number(row.id),
        email: String(row.email),
        displayName: row.display_name as string | null,
        team: row.team as string | null,
        mfaEnabledAt: row.mfa_enabled_at as string | null,
        leonardoUserId: row.leonardo_user_id as string | null,
        leonardoUsername: row.leonardo_username as string | null,
        leonardoEmail: row.leonardo_email as string | null,
        leonardoPlan: row.leonardo_plan as string | null,
        leonardoSubscriptionSource: row.leonardo_subscription_source as string | null,
        leonardoSubscriptionTokens: row.leonardo_subscription_tokens as number | null,
        leonardoPaidTokens: row.leonardo_paid_tokens as number | null,
        leonardoRolloverTokens: row.leonardo_rollover_tokens as number | null,
        leonardoApiCredit: row.leonardo_api_credit as number | null,
        leonardoTokenRenewal: row.leonardo_token_renewal as string | null,
        leonardoBlocked: Boolean(row.leonardo_blocked),
        leonardoCreatedAt: row.leonardo_created_at as string | null,
        status: (row.status as string) ?? "active",
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
    }
}

function readVaultKeyFromEnv(): string | undefined {
    try {
        return readFileSync(".env", "utf8").split(/\r?\n/).find(line => line.startsWith("TOTP_VAULT_MASTER_KEY="))?.slice("TOTP_VAULT_MASTER_KEY=".length).trim()
    } catch { return undefined }
}

