import { CanvaHandoffError, randomDelay, type CanvaInvitePage } from "./canva-invite-login.js"
import { waitForCanvaTurnstile } from "./canva-turnstile.js"

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

type LeonardoLocator = {
    count(): Promise<number>
    fill(value: string): Promise<void>
    click(): Promise<void>
    waitFor?(options: { state: "visible" | "hidden", timeout: number }): Promise<void>
    first?(): LeonardoLocator
    innerText?(): Promise<string>
}

export type LeonardoPage = {
    goto(url: string, options?: { waitUntil?: string }): Promise<unknown>
    url(): string
    locator(selector: string): LeonardoLocator
    waitForTimeout?(milliseconds: number): Promise<void>
    waitForURL?(url: string | RegExp, options?: { timeout: number }): Promise<void>
    waitForLoadState?(state?: string): Promise<unknown>
    evaluate?<R>(fn: () => R): Promise<R>
    evaluate?<R, A>(fn: (arg: A) => R, arg: A): Promise<R>
}

export interface LeonardoLoginInput {
    email: string
    password: string
    onTurnstileDetected?(): void
}

export interface LeonardoSessionData {
    session: {
        id: string
        token: string
        userId: string
        expiresAt: string
        createdAt: string
        updatedAt: string
        ipAddress: string
        userAgent: string
        accessToken: string
        accessTokenIssuedAt: string
        accessTokenExpiry: string
        hasuraUserId: string
        cognitoSub: string
    }
    user: {
        id: string
        email: string
        name: string
        emailVerified: boolean
        image: string | null
        createdAt: string
        updatedAt: string
    }
}

export interface LeonardoUserDetails {
    id: string
    username: string
    blocked: boolean
    suspensionStatus: string | null
    createdAt: string
    plan: string
    planSubscribeFrequency: string
    subscriptionSource: string
    subscriptionTokens: number
    paidTokens: number
    rolloverTokens: number
    streamTokens: number
    subscriptionGptTokens: number
    subscriptionModelTokens: number
    apiCredit: number
    apiPlan: string | null
    tokenRenewalDate: string
    auth0Email: string
    teamMemberships: LeonardoTeamMembership[]
}

export interface LeonardoTeamMembership {
    teamId: string
    userId: string
    role: string
    team: {
        id: string
        teamName: string
        plan: string
        subscriptionTokens: number
        createdAt: string
    }
}

export type LeonardoLoginResult = {
    session: LeonardoSessionData
    details: LeonardoUserDetails
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const LEONARDO_LOGIN_URL = "https://app.leonardo.ai/auth/login"
const LEONARDO_SESSION_URL = "https://app.leonardo.ai/api/auth/get-session"
const LEONARDO_GRAPHQL_URL = "https://api.leonardo.ai/v1/graphql"

const canvaOAuthSelectors = [
    "button:has-text('Canva')",
    "a:has-text('Canva')"
]
const oauthConsentSelectors = [
    "button:has-text('Cho phép')",
    "button:has-text('Allow')",
    "button:has-text('Authorize')"
]
const continueSelectors = [
    "button:has-text('Tiếp tục')",
    "button:has-text('Continue')"
]
const emailMethodSelectors = [
    "button:has-text('Tiếp tục với email')",
    "button:has-text('Continue with email')"
]
const emailInputSelectors = [
    "input[name=username]:not([readonly])",
    "input[type=email]:not([readonly])",
    "input[name=email]:not([readonly])"
]
const passwordInputSelectors = [
    "input[name=password]:not([readonly])",
    "input[type=password]:not([readonly])"
]
const loginButtonSelectors = [
    "button:has-text('Đăng nhập')",
    "button:has-text('Log in')",
    "button:has-text('Login')",
    "button[type=submit]"
]
const welcomeSelectors = [
    "h2:has-text('Welcome to Leonardo.ai')",
    "h2:has-text('Welcome to Leonardo')"
]

const pollDelayMs = 500
const pollAttempts = 60

// ────────────────────────────────────────────────────────────────
// Core Functions
// ────────────────────────────────────────────────────────────────

/**
 * Đăng nhập Leonardo.ai qua Canva OAuth.
 * Expects browser to already have a valid Canva session (from invite + password reset flow).
 */
export async function loginLeonardoViaCanva(page: LeonardoPage, input: LeonardoLoginInput): Promise<void> {
    // Step 1: Navigate to Leonardo login
    await page.goto(LEONARDO_LOGIN_URL)
    await randomDelay(page as CanvaInvitePage, 2_000, 4_000)

    // Step 2: Click "Canva" OAuth button
    await clickRequired(page, canvaOAuthSelectors, "Không tìm thấy nút Canva trên trang login Leonardo")
    await randomDelay(page as CanvaInvitePage, 3_000, 6_000)

    // Step 3: Handle Canva OAuth flow
    // After clicking Canva, browser redirects to Canva OAuth.
    // Three scenarios:
    //   A) Already logged in → auto-redirects to consent screen or straight to Leonardo
    //   B) Login form with email → fill email, password, login
    //   C) Login form with password only → fill password, login
    await handleCanvaOAuthLogin(page, input)

    // Step 4: Wait for redirect back to Leonardo
    await waitForLeonardoDashboard(page)
}

/**
 * Lấy session data từ Leonardo (chạy trong browser context).
 * Tự động chờ page ở đúng domain leonardo.ai trước khi fetch.
 */
export async function getLeonardoSession(page: LeonardoPage): Promise<LeonardoSessionData> {
    if (!page.evaluate) {
        throw new CanvaHandoffError("Browser page không hỗ trợ evaluate(). Cần Playwright page thật.")
    }

    // Ensure we're on leonardo.ai before attempting fetch
    await ensureLeonardoDomain(page)

    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            const sessionData = await page.evaluate(async () => {
                const response = await fetch("/api/auth/get-session")
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                return response.json()
            }) as LeonardoSessionData | null

            if (sessionData?.session?.accessToken) return sessionData
        } catch (error) {
            if (attempt === maxRetries) {
                const msg = error instanceof Error ? error.message : String(error)
                throw new CanvaHandoffError(`Không lấy được Leonardo session sau ${maxRetries} lần thử. Lỗi: ${msg}. Page URL: ${page.url()}`)
            }
        }
        // Wait before retry
        await randomDelay(page as CanvaInvitePage, 3_000, 5_000)
    }

    throw new CanvaHandoffError("Không lấy được session data từ Leonardo. Có thể chưa đăng nhập thành công.")
}

/**
 * Lấy account details từ Leonardo GraphQL API (chạy trong browser context).
 */
export async function getLeonardoAccountDetails(
    page: LeonardoPage,
    accessToken: string,
    cognitoSub: string
): Promise<LeonardoUserDetails> {
    if (!page.evaluate) {
        throw new CanvaHandoffError("Browser page không hỗ trợ evaluate(). Cần Playwright page thật.")
    }

    const result = await page.evaluate(async (params: { accessToken: string; cognitoSub: string; graphqlUrl: string }) => {
        const body = {
            operationName: "GetUserDetails",
            variables: { userSub: params.cognitoSub },
            query: `query GetUserDetails($userSub: String) {
                users(where: {user_details: {cognitoId: {_eq: $userSub}}}) {
                    id
                    username
                    blocked
                    suspensionStatus
                    createdAt
                    user_details {
                        id
                        apiConcurrencySlots
                        apiCredit
                        apiPaidTokens
                        apiPlan
                        apiPlanAutoTopUpTriggerBalance
                        apiPlanSubscribeDate
                        apiPlanSubscribeFrequency
                        apiPlanSubscriptionSource
                        apiPlanTokenRenewalDate
                        apiPlanTopUpAmount
                        apiSubscriptionTokens
                        auth0Email
                        interests
                        interestsRoles
                        interestsRolesOther
                        isChangelogVisible
                        lastSeenChangelogId
                        paddleId
                        plan
                        planSubscribeFrequency
                        showNsfw
                        streamTokens
                        subscriptionGptTokens
                        subscriptionModelTokens
                        subscriptionSource
                        tokenRenewalDate
                        customApiTokenRenewalAmount
                        paidTokens
                        subscriptionTokens
                        rolloverTokens
                        __typename
                    }
                    team_memberships {
                        userId
                        teamId
                        team {
                            id
                            teamName
                            plan
                            subscriptionTokens
                            createdAt
                            __typename
                        }
                        role
                        __typename
                    }
                    tos_acceptances {
                        tosHash
                        acceptedAt
                        __typename
                    }
                    __typename
                }
            }`
        }

        const response = await fetch(params.graphqlUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${params.accessToken}`
            },
            body: JSON.stringify(body)
        })
        if (!response.ok) throw new Error(`Leonardo GraphQL HTTP ${response.status}`)
        return response.json()
    }, { accessToken, cognitoSub, graphqlUrl: LEONARDO_GRAPHQL_URL }) as { data?: { users?: unknown[] } } | null

    const users = result?.data?.users
    if (!Array.isArray(users) || users.length === 0) {
        throw new CanvaHandoffError("Không lấy được account details từ Leonardo GraphQL.")
    }

    const user = users[0] as Record<string, unknown>
    const details = Array.isArray(user.user_details) ? user.user_details[0] as Record<string, unknown> : undefined
    if (!details) {
        throw new CanvaHandoffError("Leonardo user không có user_details.")
    }

    const teamMemberships = Array.isArray(user.team_memberships)
        ? (user.team_memberships as Record<string, unknown>[]).map(membership => ({
            teamId: String(membership.teamId ?? ""),
            userId: String(membership.userId ?? ""),
            role: String(membership.role ?? ""),
            team: {
                id: String((membership.team as Record<string, unknown>)?.id ?? ""),
                teamName: String((membership.team as Record<string, unknown>)?.teamName ?? ""),
                plan: String((membership.team as Record<string, unknown>)?.plan ?? ""),
                subscriptionTokens: Number((membership.team as Record<string, unknown>)?.subscriptionTokens ?? 0),
                createdAt: String((membership.team as Record<string, unknown>)?.createdAt ?? "")
            }
        }))
        : []

    return {
        id: String(user.id ?? ""),
        username: String(user.username ?? ""),
        blocked: Boolean(user.blocked),
        suspensionStatus: user.suspensionStatus as string | null ?? null,
        createdAt: String(user.createdAt ?? ""),
        plan: String(details.plan ?? ""),
        planSubscribeFrequency: String(details.planSubscribeFrequency ?? ""),
        subscriptionSource: String(details.subscriptionSource ?? ""),
        subscriptionTokens: Number(details.subscriptionTokens ?? 0),
        paidTokens: Number(details.paidTokens ?? 0),
        rolloverTokens: Number(details.rolloverTokens ?? 0),
        streamTokens: Number(details.streamTokens ?? 0),
        subscriptionGptTokens: Number(details.subscriptionGptTokens ?? 0),
        subscriptionModelTokens: Number(details.subscriptionModelTokens ?? 0),
        apiCredit: Number(details.apiCredit ?? 0),
        apiPlan: details.apiPlan as string | null ?? null,
        tokenRenewalDate: String(details.tokenRenewalDate ?? ""),
        auth0Email: String(details.auth0Email ?? ""),
        teamMemberships
    }
}

// ────────────────────────────────────────────────────────────────
// Internal Helpers
// ────────────────────────────────────────────────────────────────

async function handleCanvaOAuthLogin(page: LeonardoPage, input: LeonardoLoginInput): Promise<void> {
    // Poll for one of: consent screen, login form, or Leonardo redirect
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        const currentUrl = page.url()

        // Already redirected back to Leonardo — done
        if (currentUrl.includes("leonardo.ai") && !currentUrl.includes("login")) return

        // Canva Turnstile check
        await waitForCanvaTurnstile(page as CanvaInvitePage, {
            onDetected: input.onTurnstileDetected
        })

        // OAuth consent screen — click "Cho phép" / "Allow"
        if (await existsAny(page, oauthConsentSelectors)) {
            await clickRequired(page, oauthConsentSelectors, "Không tìm thấy nút Cho phép/Allow trên OAuth consent")
            await randomDelay(page as CanvaInvitePage, 3_000, 6_000)
            return
        }

        // Password field visible — fill and login
        if (await existsAny(page, passwordInputSelectors)) {
            await fillFirst(page, passwordInputSelectors, input.password)
            await clickFirst(page, loginButtonSelectors)
            await randomDelay(page as CanvaInvitePage, 5_000, 10_000)
            // After login, might get consent screen
            if (await existsAny(page, oauthConsentSelectors)) {
                await clickRequired(page, oauthConsentSelectors, "Không tìm thấy nút Cho phép/Allow sau login")
                await randomDelay(page as CanvaInvitePage, 3_000, 6_000)
            }
            return
        }

        // "Continue with email" button
        if (await existsAny(page, emailMethodSelectors)) {
            await clickFirst(page, emailMethodSelectors)
            await randomDelay(page as CanvaInvitePage, 1_000, 2_000)
            continue
        }

        // Email input visible — fill email, then continue to password
        if (await existsAny(page, emailInputSelectors)) {
            await fillFirst(page, emailInputSelectors, input.email)
            await clickFirst(page, continueSelectors)
            await randomDelay(page as CanvaInvitePage, 2_000, 4_000)
            continue
        }

        // Continue button (generic)
        if (await existsAny(page, continueSelectors) && currentUrl.includes("canva.com")) {
            await clickFirst(page, continueSelectors)
            await randomDelay(page as CanvaInvitePage, 2_000, 4_000)
            continue
        }

        await new Promise(resolve => setTimeout(resolve, pollDelayMs))
    }

    throw new CanvaHandoffError("Hết thời gian chờ xử lý OAuth Canva cho Leonardo. Browser được giữ lại để kiểm tra.")
}

async function waitForLeonardoDashboard(page: LeonardoPage): Promise<void> {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        const currentUrl = page.url()

        // Already on Leonardo dashboard (not login page)
        if (currentUrl.includes("leonardo.ai") && !currentUrl.includes("/auth/")) {
            // Check for Welcome dialog or just confirm we're on dashboard
            if (await existsAny(page, welcomeSelectors)) {
                await randomDelay(page as CanvaInvitePage, 2_000, 4_000)
                // Dismiss welcome dialog if present
                const dismissSelectors = [
                    "button:has-text('Get started')",
                    "button:has-text('Bắt đầu')",
                    "button[aria-label='Close']",
                    "button:has-text('Skip')",
                    "button:has-text('Bỏ qua')"
                ]
                if (await existsAny(page, dismissSelectors)) {
                    try { await clickFirst(page, dismissSelectors) } catch { /* optional */ }
                    await randomDelay(page as CanvaInvitePage, 1_000, 2_000)
                }
                return
            }
            // Even without welcome dialog, if we're on Leonardo dashboard, we're good
            await randomDelay(page as CanvaInvitePage, 2_000, 4_000)
            return
        }

        await new Promise(resolve => setTimeout(resolve, pollDelayMs))
    }

    throw new CanvaHandoffError("Leonardo.ai không redirect về dashboard sau OAuth. Browser được giữ lại để kiểm tra.")
}

async function ensureLeonardoDomain(page: LeonardoPage): Promise<void> {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        const url = page.url()
        if (url.includes("leonardo.ai") && !url.includes("/auth/")) return
        await new Promise(resolve => setTimeout(resolve, pollDelayMs))
    }
    throw new CanvaHandoffError(`Page không ở trên leonardo.ai. URL hiện tại: ${page.url()}`)
}

async function existsAny(page: LeonardoPage, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
        try {
            if (await page.locator(selector).count()) return true
        } catch { /* ignore stale context errors */ }
    }
    return false
}

async function fillFirst(page: LeonardoPage, selectors: string[], value: string): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        for (const selector of selectors) {
            const locator = page.locator(selector)
            try {
                if (await locator.count()) {
                    const target = locator.first?.() ?? locator
                    await target.waitFor?.({ state: "visible", timeout: 30_000 })
                    await randomDelay(page as CanvaInvitePage, 500, 1_500)
                    await target.fill(value)
                    await randomDelay(page as CanvaInvitePage, 500, 1_500)
                    return
                }
            } catch { /* retry */ }
        }
        await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new CanvaHandoffError("Không tìm thấy trường nhập liệu trên trang Canva OAuth. Browser được giữ lại để kiểm tra.")
}

async function clickFirst(page: LeonardoPage, selectors: string[]): Promise<void> {
    for (const selector of selectors) {
        const locator = page.locator(selector)
        try {
            if (await locator.count()) {
                const target = locator.first?.() ?? locator
                await target.waitFor?.({ state: "visible", timeout: 30_000 })
                await randomDelay(page as CanvaInvitePage, 500, 1_500)
                await target.click()
                await randomDelay(page as CanvaInvitePage, 2_000, 5_000)
                return
            }
        } catch { /* try next selector */ }
    }
}

async function clickRequired(page: LeonardoPage, selectors: string[], errorMessage: string): Promise<void> {
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        for (const selector of selectors) {
            const locator = page.locator(selector)
            try {
                if (await locator.count()) {
                    const target = locator.first?.() ?? locator
                    await target.waitFor?.({ state: "visible", timeout: 30_000 })
                    await randomDelay(page as CanvaInvitePage, 500, 1_500)
                    await target.click()
                    await randomDelay(page as CanvaInvitePage, 2_000, 5_000)
                    return
                }
            } catch { /* retry */ }
        }
        await new Promise(resolve => setTimeout(resolve, pollDelayMs))
    }
    throw new CanvaHandoffError(`${errorMessage}. Browser được giữ lại để kiểm tra.`)
}
