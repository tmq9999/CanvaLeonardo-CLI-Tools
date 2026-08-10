import { CanvaHandoffError } from "./canva-invite-login.js"

type CanvaLoginLocator = {
    count(): Promise<number>
    fill(value: string): Promise<void>
    click(): Promise<void>
    waitFor?(options: { state: "visible", timeout: number }): Promise<void>
    first?(): CanvaLoginLocator
}

export type CanvaLoginPage = {
    goto(url: string): Promise<unknown>
    url(): string
    locator(selector: string): CanvaLoginLocator
}

export type CanvaLoginInput = {
    email: string
    password: string
    sleep?(milliseconds: number): Promise<void>
    random?(): number
    onAttempt?(attempt: number, maximum: number): void
}

export type CanvaLoginResult = { status: "logged-in" | "not-required" }

export const CANVA_SECURITY_ENTRY_URL = "https://www.canva.com/login/?redirect=%2Fsettings%2Flogin-and-security"
const pollDelayMs = 250
const statePollAttempts = 40
const entryAttempts = 3
const emailSelectors = ["input[name=username]:not([readonly])", "input[type=email]:not([readonly])", "input[name=email]:not([readonly])"]
const passwordSelectors = ["input[name=password]:not([readonly])", "input[type=password]:not([readonly])"]
const emailMethodSelectors = ["button:has-text('Tiếp tục với email')", "button:has-text('Continue with email')"]
const continueSelectors = ["button:has-text('Tiếp tục')", "button:has-text('Continue')", "button[type=submit]"]
const loginSelectors = ["button:has-text('Đăng nhập')", "button:has-text('Log in')", "button:has-text('Login')"]
const securitySelectors = ["button:has-text('Bật')", "button:has-text('Enable')", "button:has-text('Tắt')", "button:has-text('Disable')"]

export async function enterCanvaLoginAndSecurity(page: CanvaLoginPage, input: CanvaLoginInput): Promise<CanvaLoginResult> {
    const sleep = input.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))
    for (let attempt = 1; attempt <= entryAttempts; attempt += 1) {
        input.onAttempt?.(attempt, entryAttempts)
        await page.goto(CANVA_SECURITY_ENTRY_URL)
        const result = await detectAndEnter(page, input, sleep)
        if (result) return result
    }
    throw new CanvaHandoffError(`Không nhận diện được flow đăng nhập hoặc Login & Security sau 3 lần tải ${CANVA_SECURITY_ENTRY_URL}`)
}

// Backwards-compatible export for callers while orchestration migrates to the entry state machine.
export async function loginCanvaAfterPasswordReset(page: CanvaLoginPage, input: CanvaLoginInput): Promise<CanvaLoginResult> {
    return enterCanvaLoginAndSecurity(page, input)
}

async function detectAndEnter(page: CanvaLoginPage, input: CanvaLoginInput, sleep: (milliseconds: number) => Promise<void>): Promise<CanvaLoginResult | undefined> {
    let emailFilled = false
    let emailSubmitted = false
    let emailMethodSelected = false
    let loginStarted = false

    for (let poll = 0; poll < statePollAttempts; poll += 1) {
        if (await existsAny(page, securitySelectors)) return { status: loginStarted ? "logged-in" : "not-required" }

        if (await existsAny(page, passwordSelectors)) {
            loginStarted = true
            await fillFirst(page, passwordSelectors, input.password, sleep, input.random)
            await clickRequired(page, loginSelectors, sleep, input.random)
            await sleep(randomBetween(5_000, 10_000, input.random))
            await page.goto(CANVA_SECURITY_ENTRY_URL)
            continue
        }
        if (!emailMethodSelected && await existsAny(page, emailMethodSelectors)) {
            loginStarted = true
            await clickRequired(page, emailMethodSelectors, sleep, input.random)
            emailMethodSelected = true
            await sleep(pollDelayMs)
            continue
        }
        if (await existsAny(page, emailSelectors)) {
            loginStarted = true
            if (!emailFilled) {
                await fillFirst(page, emailSelectors, input.email, sleep, input.random)
                emailFilled = true
            }
            if (!emailSubmitted && await existsAny(page, continueSelectors)) {
                await clickRequired(page, continueSelectors, sleep, input.random)
                emailSubmitted = true
            }
        } else if (page.url().toLowerCase().includes("/login") && await existsAny(page, continueSelectors)) {
            loginStarted = true
            await clickRequired(page, continueSelectors, sleep, input.random)
        }
        await sleep(pollDelayMs)
    }
    return undefined
}

async function existsAny(page: CanvaLoginPage, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) if (await page.locator(selector).count()) return true
    return false
}

async function fillFirst(page: CanvaLoginPage, selectors: string[], value: string, sleep: (ms: number) => Promise<void>, random?: () => number): Promise<void> {
    for (const selector of selectors) {
        const locator = page.locator(selector)
        if (await locator.count()) {
            const target = locator.first?.() ?? locator
            await target.waitFor?.({ state: "visible", timeout: 30_000 })
            await sleep(randomBetween(500, 1_500, random))
            await target.fill(value)
            await sleep(randomBetween(500, 1_500, random))
            return
        }
    }
    throw new CanvaHandoffError("Không tìm thấy trường đăng nhập Canva.")
}

async function clickRequired(page: CanvaLoginPage, selectors: string[], sleep: (ms: number) => Promise<void>, random?: () => number): Promise<void> {
    for (const selector of selectors) {
        const locator = page.locator(selector)
        if (await locator.count()) {
            const target = locator.first?.() ?? locator
            await target.waitFor?.({ state: "visible", timeout: 30_000 })
            await sleep(randomBetween(500, 1_500, random))
            await target.click()
            await sleep(randomBetween(2_000, 5_000, random))
            return
        }
    }
    throw new CanvaHandoffError("Không tìm thấy nút đăng nhập Canva.")
}

function randomBetween(minimum: number, maximum: number, random = Math.random): number {
    return Math.round(minimum + (maximum - minimum) * random())
}
