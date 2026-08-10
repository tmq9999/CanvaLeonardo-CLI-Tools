import { CanvaHandoffError, randomDelay } from "./canva-invite-login.js"
import { extractCanvaTotpSecret, generateTotp } from "../services/totp.js"

type CanvaMfaLocator = {
    count(): Promise<number>
    fill(value: string): Promise<void>
    click(): Promise<void>
    allTextContents(): Promise<string[]>
    innerText(): Promise<string>
    waitFor?(options: { state: "visible" | "hidden", timeout: number }): Promise<void>
    first?(): CanvaMfaLocator
}

export type CanvaMfaPage = {
    goto(url: string): Promise<unknown>
    locator(selector: string): CanvaMfaLocator
    waitForTimeout?(milliseconds: number): Promise<void>
}

export type CanvaMfaInput = {
    password: string
    persistTotpSecret(secret: string): Promise<void> | void
    persistRecoveryCodes(codes: string[]): Promise<void> | void
    getServerTime?(): Promise<number>
    generateCode?(secret: string, now: number): string
    sleep?(milliseconds: number): Promise<void>
}

export type CanvaMfaResult = {
    status: "enabled" | "already-enabled"
    secretStored: boolean
    recoveryCodesStored: boolean
}

const authenticatorEnableSelectors = [
    "div:has-text('Ứng dụng xác thực') button:has-text('Bật')",
    "div:has-text('Authenticator app') button:has-text('Enable')"
]
const authenticatorDisableSelectors = [
    "div:has-text('Ứng dụng xác thực') button:has-text('Tắt')",
    "div:has-text('Authenticator app') button:has-text('Disable')"
]
const pollDelayMs = 250
const pollAttempts = 40

export async function enableCanvaAuthenticatorMfa(page: CanvaMfaPage, input: CanvaMfaInput): Promise<CanvaMfaResult> {
    const sleep = input.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))

    if (await authenticatorIsEnabled(page)) return { status: "already-enabled", secretStored: false, recoveryCodesStored: false }
    if (!await waitForSecuritySettings(page, sleep)) {
        throw new CanvaHandoffError("Trang Login & Security chưa sẵn sàng để bật 2FA Canva.")
    }

    await clickRequired(page, authenticatorEnableSelectors, sleep)
    await fillRequired(page, ["input[type=password]"], input.password, sleep)
    await clickRequired(page, ["button:has-text('Xác nhận mật khẩu')", "button:has-text('Confirm password')"], sleep)
    await clickRequired(page, ["text=Hiện mã khóa bí mật", "text=Show secret key"], sleep)

    const secret = await readRevealedTotpSecret(page, sleep)
    const now = await getSafeTotpTime(input.getServerTime, sleep)
    const code = (input.generateCode ?? generateTotp)(secret, now)
    await fillRequired(page, ["input[inputmode=numeric], input[autocomplete=one-time-code]"], code, sleep)
    await clickRequired(page, ["button:has-text('Bật ứng dụng xác thực')", "button:has-text('Enable authenticator app')"], sleep)

    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        if (await existsAny(page, ["text=Mã bạn nhập không chính xác.", "text=The code you entered is incorrect."])) {
            throw new CanvaHandoffError("Mã TOTP Canva không hợp lệ. Secret chưa được lưu vào vault.")
        }
        if (await authenticatorIsEnabled(page)) {
            const recoveryCodes = await readRecoveryCodes(page, sleep)
            await input.persistTotpSecret(secret)
            await input.persistRecoveryCodes(recoveryCodes)
            await clickRequired(page, ["button:has-text('Hoàn tất việc thiết lập')", "button:has-text('Finish setup')"], sleep)
            return { status: "enabled", secretStored: true, recoveryCodesStored: true }
        }
        await sleep(pollDelayMs)
    }

    throw new CanvaHandoffError("Canva chưa xác nhận đã bật Ứng dụng xác thực. Secret chưa được lưu vào vault.")
}

async function waitForSecuritySettings(page: CanvaMfaPage, sleep: (milliseconds: number) => Promise<void>): Promise<boolean> {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        if (await existsAny(page, authenticatorEnableSelectors)) return true
        await sleep(pollDelayMs)
    }
    return false
}

async function authenticatorIsEnabled(page: CanvaMfaPage): Promise<boolean> {
    return existsAny(page, authenticatorDisableSelectors)
}

async function readRevealedTotpSecret(page: CanvaMfaPage, sleep: (milliseconds: number) => Promise<void>): Promise<string> {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        const values = await page.locator("p").allTextContents()
        const fields = values
            .map(value => value.replace(/\s+/g, "").trim())
            .filter(value => /^[A-Z2-7]{16,}$/.test(value))
        if (fields.length === 1) return extractCanvaTotpSecret(fields[0])
        await sleep(pollDelayMs)
    }
    throw new CanvaHandoffError("Không đọc được mã khóa bí mật TOTP từ Canva. Secret chưa được lưu vào vault.")
}

async function readRecoveryCodes(page: CanvaMfaPage, sleep: (milliseconds: number) => Promise<void>): Promise<string[]> {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        const codes = Array.from(new Set((await page.locator("body").innerText()).match(/[A-Z0-9]{4}-[A-Z0-9]{4}/g) ?? []))
        if (codes.length === 10) return codes
        await sleep(pollDelayMs)
    }
    throw new CanvaHandoffError("Canva chưa hiển thị đủ 10 mã dự phòng. TOTP secret chưa được lưu vào vault.")
}

async function getSafeTotpTime(getServerTime: CanvaMfaInput["getServerTime"], sleep: (milliseconds: number) => Promise<void>): Promise<number> {
    const now = getServerTime ?? getCanvaServerTime
    let value = await now()
    const intoWindow = value % 30_000
    const waitMs = intoWindow < 5_000 ? 5_000 - intoWindow : intoWindow > 25_000 ? 35_000 - intoWindow : 0
    if (waitMs > 0) await sleep(waitMs)
    value = await now()
    return value
}

async function getCanvaServerTime(): Promise<number> {
    const response = await fetch("https://www.canva.com/", { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } })
    const serverTime = Date.parse(response.headers.get("date") ?? "")
    return Number.isNaN(serverTime) ? Date.now() : serverTime + 1_500
}

async function existsAny(page: CanvaMfaPage, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
        if (await page.locator(selector).count()) return true
    }
    return false
}

async function clickRequired(page: CanvaMfaPage, selectors: string[], sleep: (milliseconds: number) => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        for (const selector of selectors) {
            const locator = page.locator(selector)
            if (await locator.count()) {
                const target = locator.first?.() ?? locator
                await target.waitFor?.({ state: "visible", timeout: 30_000 })
                await randomDelay(page, 500, 1_500)
                try {
                    await target.click()
                } catch (error) {
                    if (!(error instanceof Error) || !error.message.includes("intercepts pointer events")) throw error
                    const blockingLayer = page.locator("div[data-is-layer-marker='true']:has(.GMhonQ)")
                    if (await blockingLayer.count()) {
                        await blockingLayer.waitFor?.({ state: "hidden", timeout: 60_000 })
                        await randomDelay(page, 2_000, 5_000)
                        await target.waitFor?.({ state: "visible", timeout: 30_000 })
                        await target.click()
                    } else {
                        throw error
                    }
                }
                await randomDelay(page, 2_000, 5_000)
                return
            }
        }
        await sleep(pollDelayMs)
    }
    throw new CanvaHandoffError("Không tìm thấy bước bật 2FA của Canva. Browser được giữ lại để bạn kiểm tra.")
}

async function fillRequired(page: CanvaMfaPage, selectors: string[], value: string, sleep: (milliseconds: number) => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        for (const selector of selectors) {
            const locator = page.locator(selector)
            if (await locator.count()) {
                const target = locator.first?.() ?? locator
                await target.waitFor?.({ state: "visible", timeout: 30_000 })
                await randomDelay(page, 500, 1_500)
                await target.fill(value)
                await randomDelay(page, 500, 1_500)
                return
            }
        }
        await sleep(pollDelayMs)
    }
    throw new CanvaHandoffError("Không tìm thấy trường nhập 2FA Canva. Browser được giữ lại để bạn kiểm tra.")
}
