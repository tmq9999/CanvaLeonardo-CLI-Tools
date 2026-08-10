import { waitForCanvaTurnstile } from "./canva-turnstile.js"

type Locator = {
    count(): Promise<number>
    fill(value: string): Promise<void>
    click(): Promise<void>
    waitFor?(options: { state: "visible" | "hidden", timeout: number }): Promise<void>
    isDisabled?(): Promise<boolean>
    first?(): Locator
    last?(): Locator
}

export type CanvaInvitePage = {
    goto(url: string): Promise<unknown>
    url?(): string
    locator(selector: string): Locator
    waitForTimeout?(milliseconds: number): Promise<void>
    waitForURL?(url: RegExp, options: { timeout: number, waitUntil: "domcontentloaded" }): Promise<void>
    waitForLoadState?(state?: string): Promise<unknown>
}

export type CanvaInviteInput = {
    inviteUrl: string
    email: string
    name: string
    requestOtp(after: string): Promise<string>
    now?(): string
    onTurnstileDetected?(): void
}

export class CanvaHandoffError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "CanvaHandoffError"
    }
}

export async function randomDelay(page: CanvaInvitePage, minimum: number, maximum: number): Promise<void> {
    if (!page.waitForTimeout) return
    const milliseconds = Math.round(minimum + (maximum - minimum) * Math.random())
    await page.waitForTimeout(milliseconds)
}

export async function joinCanvaInvite(page: CanvaInvitePage, input: CanvaInviteInput): Promise<void> {
    await page.goto(input.inviteUrl)
    await waitForCanvaTurnstile(page, { onDetected: input.onTurnstileDetected })

    const emailInputs = ["input[type=email]", "input[name=email]", "input[name=username]"]
    const nameInputs = ["input[name=name]", "input[autocomplete=name]"]
    if (!await existsAny(page, emailInputs)) {
        await clickFirst(page, [
            "button:has-text('Continue with email')",
            "button:has-text('Tiếp tục với email')"
        ])
    }
    await fillFirst(page, emailInputs, input.email)
    if (!await existsAny(page, nameInputs)) {
        await clickFirst(page, ["button[type=submit]", "button:has-text('Continue')", "button:has-text('Tiếp tục')"])
    }
    await fillFirst(page, nameInputs, input.name)
    const after = (input.now ?? (() => new Date().toISOString()))()
    await clickFirst(page, ["button[type=submit]", "button:has-text('Continue')", "button:has-text('Tiếp tục')"])

    const otp = await input.requestOtp(after)
    const otpInputs = ["input[inputmode=numeric]", "input[name=code]", "input[autocomplete=one-time-code]"]
    await fillFirst(page, otpInputs, otp)
    if (!await hasOtpAutoTransitioned(page, otpInputs)) {
        await clickIfPresent(page, ["button[type=submit]", "button:has-text('Verify')", "button:has-text('Xác nhận')"])
    }
    await clickIfPresent(page, ["button.join", "button:has-text('Join team')", "button:has-text('Tham gia')"])
}

async function exists(page: CanvaInvitePage, selector: string): Promise<boolean> {
    return (await page.locator(selector).count()) > 0
}

async function existsAny(page: CanvaInvitePage, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
        if (await exists(page, selector)) return true
    }
    return false
}

async function fillFirst(page: CanvaInvitePage, selectors: string[], value: string): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        for (const selector of selectors) {
            const locator = page.locator(selector)
            if (await locator.count()) {
                await locator.waitFor?.({ state: "visible", timeout: 30_000 })
                await randomDelay(page, 500, 1_500)
                await locator.fill(value)
                await randomDelay(page, 500, 1_500)
                return
            }
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new CanvaHandoffError("Không tìm thấy trường Canva mong đợi. Browser được giữ lại để bạn kiểm tra.")
}

async function clickFirst(page: CanvaInvitePage, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
        const locator = page.locator(selector)
        if (await locator.count()) {
            await locator.waitFor?.({ state: "visible", timeout: 30_000 })
            await randomDelay(page, 500, 1_500)
            await locator.click()
            await randomDelay(page, 2_000, 5_000)
            return
        }
    }
    throw new CanvaHandoffError("Không tìm thấy nút Canva mong đợi. Browser được giữ lại để bạn kiểm tra.")
}

async function clickIfPresent(page: CanvaInvitePage, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
        const locator = page.locator(selector)
        if (await locator.count()) {
            await locator.waitFor?.({ state: "visible", timeout: 30_000 })
            await randomDelay(page, 500, 1_500)
            await locator.click()
            await randomDelay(page, 2_000, 5_000)
            return
        }
    }
}

async function hasOtpAutoTransitioned(page: CanvaInvitePage, otpInputs: string[]): Promise<boolean> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            if (!await existsAny(page, otpInputs)) {
                await waitForNavigation(page)
                return true
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes("Execution context was destroyed")) {
                await waitForNavigation(page)
                return true
            }
            throw error
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    return false
}

async function waitForNavigation(page: CanvaInvitePage): Promise<void> {
    try { await page.waitForLoadState?.("domcontentloaded") }
    catch { /* continue to optional Join-team button lookup after navigation settles */ }
}
