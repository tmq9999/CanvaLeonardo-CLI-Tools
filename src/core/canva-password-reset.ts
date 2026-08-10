import { CanvaHandoffError, randomDelay, type CanvaInvitePage } from "./canva-invite-login.js"
import { waitForCanvaTurnstile } from "./canva-turnstile.js"

const RESET_URL = "https://www.canva.com/login/reset"
const submitSelectors = ["button[type=submit]", "button:has-text('Continue')", "button:has-text('Tiếp tục')"]

export type CanvaPasswordResetInput = {
    email: string
    password: string
    requestOtp(after: string): Promise<string>
    now?(): string
    onTurnstileDetected?(): void
}

export async function resetCanvaPassword(page: CanvaInvitePage, input: CanvaPasswordResetInput): Promise<void> {
    await page.goto(RESET_URL)
    await waitForCanvaTurnstile(page, { onDetected: input.onTurnstileDetected })

    await fillFirst(page, ["input[name=username]", "input[type=email]", "input[name=email]"], input.email)
    const after = recentResetOtpAfter((input.now ?? (() => new Date().toISOString()))())
    await clickFirst(page, submitSelectors)

    const passwordInputs = ["input[name=password]", "input[name=new-password]", "input[autocomplete=new-password]"]
    const otpInputs = ["input[autocomplete=one-time-code]", "input[inputmode=numeric]", "input[name=code]"]
    const initialStage = await waitForPasswordOrOtp(page, passwordInputs, otpInputs)
    if (initialStage === "password") {
        await fillFirst(page, passwordInputs, input.password)
        await fillLastFirst(page, ["input[name=confirm-password]", "input[name=password_confirmation]", "input[autocomplete=new-password]"], input.password)
        await clickIfPresent(page, submitSelectors)

        const afterPassword = await waitForOtpOrSuccess(page, otpInputs)
        if (afterPassword === "success") {
            await completeSuccessfulReset(page)
            return
        }
        if (afterPassword === "otp") {
            const otp = await input.requestOtp(after)
            await submitOtp(page, otpInputs, otp)
        }
        await waitForSuccess(page)
        await completeSuccessfulReset(page)
        return
    }

    if (initialStage === "otp") {
        const otp = await input.requestOtp(after)
        await submitOtp(page, otpInputs, otp)
    } else {
        throw new CanvaHandoffError("Canva chưa hiển thị form đặt mật khẩu hoặc OTP. Browser được giữ lại để bạn kiểm tra.")
    }
    await fillFirst(page, passwordInputs, input.password)
    await fillLastFirst(page, ["input[name=confirm-password]", "input[name=password_confirmation]", "input[autocomplete=new-password]"], input.password)
    await clickIfPresent(page, submitSelectors)
    await waitForSuccess(page)
    await completeSuccessfulReset(page)
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
                const target = locator.first?.() ?? locator
                await target.waitFor?.({ state: "visible", timeout: 30_000 })
                await randomDelay(page, 500, 1_500)
                await target.fill(value)
                await randomDelay(page, 500, 1_500)
                return
            }
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new CanvaHandoffError("Không tìm thấy trường đặt lại mật khẩu Canva. Browser được giữ lại để bạn kiểm tra.")
}

async function fillLastFirst(page: CanvaInvitePage, selectors: string[], value: string): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        for (const selector of selectors) {
            const locator = page.locator(selector)
            if (await locator.count()) {
                const target = locator.last?.() ?? locator
                await target.waitFor?.({ state: "visible", timeout: 30_000 })
                await randomDelay(page, 500, 1_500)
                await target.fill(value)
                await randomDelay(page, 500, 1_500)
                return
            }
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new CanvaHandoffError("Không tìm thấy trường xác nhận mật khẩu Canva. Browser được giữ lại để bạn kiểm tra.")
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
    throw new CanvaHandoffError("Không tìm thấy nút đặt lại mật khẩu Canva. Browser được giữ lại để bạn kiểm tra.")
}

async function clickIfPresent(page: CanvaInvitePage, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
        const locator = page.locator(selector)
        if (await locator.count()) {
            if (locator.isDisabled && await locator.isDisabled()) continue
            await locator.waitFor?.({ state: "visible", timeout: 30_000 })
            await randomDelay(page, 500, 1_500)
            await locator.click()
            await randomDelay(page, 2_000, 5_000)
            return
        }
    }
}

async function waitForPasswordOrOtp(
    page: CanvaInvitePage,
    passwordInputs: string[],
    otpInputs: string[]
): Promise<"password" | "otp" | null> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            if (await existsAny(page, passwordInputs)) return "password"
            if (await existsAny(page, otpInputs)) return "otp"
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error
            try { await page.waitForLoadState?.("domcontentloaded") } catch { /* retry selector lookup */ }
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    return null
}

async function waitForOtpOrSuccess(page: CanvaInvitePage, otpInputs: string[]): Promise<"otp" | "success" | null> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await exists(page, "text=Bạn đã đặt lại mật khẩu thành công!")) return "success"
        if (await existsAny(page, otpInputs)) return "otp"
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    return null
}

async function submitOtp(page: CanvaInvitePage, otpInputs: string[], otp: string): Promise<void> {
    await fillFirst(page, otpInputs, otp)
    if (!await hasOtpAutoTransitioned(page, otpInputs)) {
        await clickIfPresent(page, submitSelectors)
    }
}

async function hasOtpAutoTransitioned(page: CanvaInvitePage, otpInputs: string[]): Promise<boolean> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            if (!await existsAny(page, otpInputs)) {
                try { await page.waitForLoadState?.("domcontentloaded") } catch { /* page already navigated */ }
                return true
            }
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error
            try { await page.waitForLoadState?.("domcontentloaded") } catch { /* retry selector lookup */ }
            return true
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    return false
}

async function waitForSuccess(page: CanvaInvitePage): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await exists(page, "text=Bạn đã đặt lại mật khẩu thành công!")) return
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new CanvaHandoffError("Canva chưa xác nhận đặt lại mật khẩu. Browser được giữ lại để bạn kiểm tra.")
}

async function completeSuccessfulReset(page: CanvaInvitePage): Promise<void> {
    if (!page.url) return

    const continueSelector = "[role=region]:has-text('Bạn đã đặt lại mật khẩu thành công!') button:has-text('Tiếp tục')"
    const englishContinueSelector = "[role=region]:has-text('You have successfully reset your password') button:has-text('Continue')"
    await clickFirstWithWait(page, [continueSelector, englishContinueSelector])
    await randomDelay(page, 5_000, 10_000)
}

async function clickFirstWithWait(page: CanvaInvitePage, selectors: string[]): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        for (const selector of selectors) {
            const locator = page.locator(selector)
            if (await locator.count()) {
                const target = locator.first?.() ?? locator
                await target.waitFor?.({ state: "visible", timeout: 30_000 })
                await randomDelay(page, 3_000, 5_000)
                await target.click()
                await randomDelay(page, 2_000, 5_000)
                return
            }
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new CanvaHandoffError("Không tìm thấy nút Tiếp tục sau khi đặt lại mật khẩu Canva.")
}

function recentResetOtpAfter(requestedAt: string): string {
    const timestamp = Date.parse(requestedAt)
    if (Number.isNaN(timestamp)) return requestedAt
    return new Date(timestamp - 10 * 60 * 1000).toISOString()
}
