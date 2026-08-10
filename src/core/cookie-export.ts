import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface ExportedCookie {
    name: string
    value: string
    domain: string
    path: string
    expires: number         // Unix timestamp (-1 = session cookie)
    httpOnly: boolean
    secure: boolean
    sameSite: "Strict" | "Lax" | "None"
}

export interface CookieExportResult {
    email: string
    exportedAt: string      // ISO 8601
    canvaCookies: ExportedCookie[]
    leonardoCookies: ExportedCookie[]
}

type PlaywrightCookie = {
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite: "Strict" | "Lax" | "None"
}

type CookieCapableContext = {
    cookies?(urls?: string | string[]): Promise<PlaywrightCookie[]>
    storageState?(): Promise<{ cookies: PlaywrightCookie[] }>
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const DEFAULT_COOKIE_DIR = resolve("data/cookies")
const CANVA_DOMAINS = [".canva.com", "canva.com", "www.canva.com"]
const LEONARDO_DOMAINS = [".leonardo.ai", "leonardo.ai", "app.leonardo.ai", "api.leonardo.ai"]

// ────────────────────────────────────────────────────────────────
// Core Functions
// ────────────────────────────────────────────────────────────────

/**
 * Lấy toàn bộ cookies từ browser context, tách thành Canva và Leonardo.
 */
export async function extractAllCookies(
    context: CookieCapableContext,
    email: string
): Promise<CookieExportResult> {
    let rawCookies: PlaywrightCookie[]

    if (context.cookies) {
        // Playwright BrowserContext.cookies()
        rawCookies = await context.cookies()
    } else if (context.storageState) {
        // Fallback: storageState()
        const state = await context.storageState()
        rawCookies = state.cookies
    } else {
        throw new Error("Browser context không hỗ trợ cookies() hoặc storageState()")
    }

    const canvaCookies: ExportedCookie[] = []
    const leonardoCookies: ExportedCookie[] = []

    for (const cookie of rawCookies) {
        const normalized = normalizeCookie(cookie)
        if (isCanvaDomain(cookie.domain)) {
            canvaCookies.push(normalized)
        } else if (isLeonardoDomain(cookie.domain)) {
            leonardoCookies.push(normalized)
        }
        // Cookies from other domains (Cloudflare, etc.) are skipped
    }

    return {
        email,
        exportedAt: new Date().toISOString(),
        canvaCookies,
        leonardoCookies
    }
}

/**
 * Lưu cookies ra file JSON tại data/cookies/{email}.json
 */
export async function saveCookiesToFile(
    email: string,
    cookies: CookieExportResult,
    outputDir = DEFAULT_COOKIE_DIR
): Promise<string> {
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9@._-]/g, "_")
    const filePath = join(outputDir, `${sanitizedEmail}.json`)

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, `${JSON.stringify(cookies, null, 2)}\n`, "utf8")

    return filePath
}

/**
 * Load cookies từ file (cho tool quản lý sau này).
 */
export async function loadCookiesFromFile(
    email: string,
    outputDir = DEFAULT_COOKIE_DIR
): Promise<CookieExportResult | null> {
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9@._-]/g, "_")
    const filePath = join(outputDir, `${sanitizedEmail}.json`)

    try {
        const content = await readFile(filePath, "utf8")
        return JSON.parse(content) as CookieExportResult
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
    }
}

// ────────────────────────────────────────────────────────────────
// Internal Helpers
// ────────────────────────────────────────────────────────────────

function normalizeCookie(cookie: PlaywrightCookie): ExportedCookie {
    return {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires ?? -1,
        httpOnly: cookie.httpOnly ?? false,
        secure: cookie.secure ?? false,
        sameSite: cookie.sameSite ?? "None"
    }
}

function isCanvaDomain(domain: string): boolean {
    const lower = domain.toLowerCase()
    return CANVA_DOMAINS.some(candidate => lower === candidate || lower.endsWith(candidate))
}

function isLeonardoDomain(domain: string): boolean {
    const lower = domain.toLowerCase()
    return LEONARDO_DOMAINS.some(candidate => lower === candidate || lower.endsWith(candidate))
}
