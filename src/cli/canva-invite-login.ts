import { readFile } from "node:fs/promises"
import { faker } from "@faker-js/faker"
import { joinCanvaInvite, type CanvaInvitePage, type CanvaInviteInput } from "../core/canva-invite-login.js"
import { enterCanvaLoginAndSecurity, type CanvaLoginPage, type CanvaLoginInput, type CanvaLoginResult } from "../core/canva-login.js"
import { enableCanvaAuthenticatorMfa, type CanvaMfaPage, type CanvaMfaInput, type CanvaMfaResult } from "../core/canva-mfa.js"
import { resetCanvaPassword, type CanvaPasswordResetInput } from "../core/canva-password-reset.js"
import { waitForCanvaPageStability, type CanvaPageStabilityOptions } from "../core/canva-page-stability.js"
import { loginLeonardoViaCanva, getLeonardoSession, getLeonardoAccountDetails, type LeonardoPage, type LeonardoLoginInput, type LeonardoSessionData, type LeonardoUserDetails } from "../core/leonardo.js"
import { extractAllCookies, saveCookiesToFile, type CookieExportResult } from "../core/cookie-export.js"
import { type AppConfig, loadConfig, resolveCanvaPassword } from "../core/config.js"
import { createRuntimeAdapter, ProxyManager } from "../core/runtime-adapters.js"
import { CanvaOtpClient } from "../services/canva-otp.js"
import { createCustomMailbox } from "../services/custom-mail.js"
import { LocalCanvaVault } from "../services/local-vault.js"
import { buildBrowserLaunchOptions } from "../runtime/browser-runtime.js"
import { logger } from "../utils/logger.js"

export type CanvaAccountFlowInput = {
    inviteUrl: string
    email: string
    name: string
    password: string
    enableMfa: boolean
    enableLeonardo: boolean
}

export type CanvaAccountFlowDependencies = {
    joinInvite(page: CanvaInvitePage, input: CanvaInviteInput): Promise<void>
    stabilize(page: CanvaInvitePage, options: CanvaPageStabilityOptions): Promise<void>
    resetPassword(page: CanvaInvitePage, input: CanvaPasswordResetInput): Promise<void>
    enterSecurity(page: CanvaLoginPage, input: CanvaLoginInput): Promise<CanvaLoginResult>
    enableMfa(page: CanvaMfaPage, input: CanvaMfaInput): Promise<CanvaMfaResult>
    loginLeonardo(page: LeonardoPage, input: LeonardoLoginInput): Promise<void>
    getLeonardoSession(page: LeonardoPage): Promise<LeonardoSessionData>
    getLeonardoDetails(page: LeonardoPage, accessToken: string, cognitoSub: string): Promise<LeonardoUserDetails>
    exportCookies(email: string): Promise<CookieExportResult>
    persistLeonardoData(email: string, session: LeonardoSessionData, details: LeonardoUserDetails, cookies: CookieExportResult): Promise<void>
    requestInviteOtp(after: string): Promise<string>
    requestResetOtp(after: string): Promise<string>
    persistTotpSecret(secret: string): Promise<void> | void
    persistRecoveryCodes(codes: string[]): Promise<void> | void
    onSecurityAttempt?(attempt: number, maximum: number): void
    onTurnstileDetected?(phase: "invite" | "reset" | "leonardo"): void
}

export type CanvaAccountFlowResult = {
    login?: CanvaLoginResult
    mfa?: CanvaMfaResult
    leonardo?: { session: LeonardoSessionData; details: LeonardoUserDetails }
    cookies?: CookieExportResult
}

export async function runCanvaAccountFlow(page: CanvaInvitePage & CanvaLoginPage & CanvaMfaPage & LeonardoPage, input: CanvaAccountFlowInput, dependencies: CanvaAccountFlowDependencies): Promise<CanvaAccountFlowResult> {
    const result: CanvaAccountFlowResult = {}

    // Phase 1: Join Canva Invite
    await dependencies.joinInvite(page, {
        inviteUrl: input.inviteUrl,
        email: input.email,
        name: input.name,
        requestOtp: dependencies.requestInviteOtp,
        onTurnstileDetected: () => dependencies.onTurnstileDetected?.("invite")
    })
    await dependencies.stabilize(page, { minimumMs: 5_000, maximumMs: 10_000 })

    // Phase 2: Password Reset
    await dependencies.resetPassword(page, {
        email: input.email,
        password: input.password,
        requestOtp: dependencies.requestResetOtp,
        onTurnstileDetected: () => dependencies.onTurnstileDetected?.("reset")
    })
    await dependencies.stabilize(page, { minimumMs: 5_000, maximumMs: 10_000 })

    // Phase 3: 2FA (optional — off by default)
    if (input.enableMfa) {
        result.login = await dependencies.enterSecurity(page, {
            email: input.email, password: input.password, onAttempt: dependencies.onSecurityAttempt
        })
        result.mfa = await dependencies.enableMfa(page, {
            password: input.password,
            persistTotpSecret: dependencies.persistTotpSecret,
            persistRecoveryCodes: dependencies.persistRecoveryCodes
        })
    }

    // Phase 4: Leonardo OAuth Login
    if (input.enableLeonardo) {
        await dependencies.loginLeonardo(page, {
            email: input.email,
            password: input.password,
            onTurnstileDetected: () => dependencies.onTurnstileDetected?.("leonardo")
        })
        await dependencies.stabilize(page, { minimumMs: 3_000, maximumMs: 5_000 })

        // Phase 5: Get Leonardo Session + Account Details
        const session = await dependencies.getLeonardoSession(page)
        const details = await dependencies.getLeonardoDetails(page, session.session.accessToken, session.session.cognitoSub)
        result.leonardo = { session, details }

        // Phase 6: Export Cookies (Canva + Leonardo)
        const cookies = await dependencies.exportCookies(input.email)
        result.cookies = cookies

        // Phase 7: Persist everything
        await dependencies.persistLeonardoData(input.email, session, details, cookies)
    }

    return result
}

export type CanvaInviteLoginArgs = {
    inviteUrl: string
    email?: string
    name?: string
}

export type CanvaInviteArgumentOptions = {
    allowGeneratedEmail?: boolean
    allowGeneratedName?: boolean
}

export function parseCanvaInviteLoginArgs(
    args: string[],
    { allowGeneratedEmail = false, allowGeneratedName = false }: CanvaInviteArgumentOptions = {}
): CanvaInviteLoginArgs {
    const read = (flag: string) => {
        const index = args.indexOf(flag)
        return index >= 0 ? args[index + 1]?.trim() : undefined
    }
    const inviteUrl = read("--invite")
    const email = read("--email")
    const name = read("--name")
    if (!inviteUrl) throw new Error("Thiếu --invite")
    if (!email && !allowGeneratedEmail) throw new Error("Thiếu --email")
    if (!name && !allowGeneratedName) throw new Error("Thiếu --name")
    const url = new URL(inviteUrl)
    if (url.protocol !== "https:" || (url.hostname !== "canva.com" && !url.hostname.endsWith(".canva.com"))) {
        throw new Error("Invite phải là HTTPS URL của Canva")
    }
    if (email && !email.includes("@")) throw new Error("Email không hợp lệ")
    return { inviteUrl, email, name }
}

export function resolveCanvaInviteIdentity(
    args: CanvaInviteLoginArgs,
    config: AppConfig,
    fullName = () => faker.person.fullName()
): { email: string; name: string } {
    const isCustomMail = config.general.serviceMail === "custom"
    const email = isCustomMail ? createCustomMailbox(config.general.customMail) : args.email
    const name = isCustomMail ? args.name ?? fullName() : args.name
    if (!email) throw new Error("Thiếu --email khi Service Mail không phải Custom Mail")
    if (!name) throw new Error("Thiếu --name khi Service Mail không phải Custom Mail")
    return { email, name }
}

async function readOtpToken(): Promise<string> {
    if (process.env.CANVA_OTP_TOKEN?.trim()) return process.env.CANVA_OTP_TOKEN.trim()
    try {
        const envText = await readFile(".env", "utf8")
        const line = envText.split(/\r?\n/).find(value => value.startsWith("CANVA_OTP_TOKEN="))
        const token = line?.slice("CANVA_OTP_TOKEN=".length).trim()
        if (token) return token
    } catch { /* caller receives the safe missing-token error */ }
    throw new Error("Thiếu CANVA_OTP_TOKEN trong môi trường hoặc .env")
}

export async function runCanvaInviteLogin(args: CanvaInviteLoginArgs, loadedConfig?: AppConfig): Promise<void> {
    const config = loadedConfig ?? await loadConfig()
    const { email: mailbox, name } = resolveCanvaInviteIdentity(args, config)
    const token = await readOtpToken()
    const otpClient = new CanvaOtpClient(config.general.serviceMail === "custom" ? config.general.customMail.workerUrl : "https://tempmail.benobaty.online", token)
    const proxyManager = new ProxyManager(config)
    const [resolved] = await proxyManager.resolveRoundRobin(1)
    const adapter = createRuntimeAdapter(config)
    const session = await adapter.launch({
        ...buildBrowserLaunchOptions(config, resolved.proxy),
        profileName: mailbox
    })
    const password = resolveCanvaPassword(config)

    try {
        if (config.general.serviceMail === "custom") {
            logger.info(`Đã tạo Custom Mail: ${mailbox}`)
            if (!args.name) logger.info(`Đã tạo tên: ${name}`)
        }
        let vault: LocalCanvaVault | undefined
        try {
            const result = await runCanvaAccountFlow(session.page as CanvaInvitePage & CanvaLoginPage & CanvaMfaPage & LeonardoPage, {
                inviteUrl: args.inviteUrl,
                email: mailbox,
                name,
                password,
                enableMfa: config.general.canvaEnableMfa,
                enableLeonardo: config.general.leonardoAutoLogin
            }, {
                joinInvite: joinCanvaInvite,
                stabilize: waitForCanvaPageStability,
                resetPassword: resetCanvaPassword,
                enterSecurity: enterCanvaLoginAndSecurity,
                enableMfa: enableCanvaAuthenticatorMfa,
                loginLeonardo: loginLeonardoViaCanva,
                getLeonardoSession,
                getLeonardoDetails: getLeonardoAccountDetails,
                exportCookies: async (email) => {
                    const context = (session as unknown as { context?: unknown }).context
                    return extractAllCookies(context as Parameters<typeof extractAllCookies>[0], email)
                },
                persistLeonardoData: async (email, leonardoSession, details, cookies) => {
                    vault ??= new LocalCanvaVault()
                    vault.storeCanvaPassword(email, password)
                    vault.storeLeonardoInfo(email, details)
                    vault.storeCookies(email, "canva", cookies.canvaCookies)
                    vault.storeCookies(email, "leonardo", cookies.leonardoCookies)
                    await saveCookiesToFile(email, cookies)
                },
                requestInviteOtp: async after => {
                    logger.info("Đang chờ OTP Canva từ Worker.")
                    const result = await otpClient.waitForOtp({ mailbox, after })
                    logger.success(result.sourceMail ? "Đã nhận OTP từ relay đã nhận diện" : "Đã nhận OTP")
                    return result.otp
                },
                requestResetOtp: async after => {
                    logger.info("Đang chờ mã đặt lại mật khẩu từ Worker.")
                    return (await otpClient.waitForOtp({ mailbox, after, purpose: "reset" })).otp
                },
                persistTotpSecret: secret => {
                    vault ??= new LocalCanvaVault()
                    vault.storeTotpSecret(mailbox, secret, name)
                },
                persistRecoveryCodes: codes => {
                    vault ??= new LocalCanvaVault()
                    vault.storeRecoveryCodes(mailbox, codes)
                },
                onSecurityAttempt: (attempt, maximum) => logger.info(`Đang mở Login & Security lần ${attempt}/${maximum}`),
                onTurnstileDetected: phase => {
                    const phaseLabels: Record<string, string> = { invite: "invite", reset: "đặt lại mật khẩu", leonardo: "Leonardo OAuth" }
                    logger.warn(`Phát hiện Cloudflare ở bước ${phaseLabels[phase] ?? phase}; tự chờ 30–60 giây.`)
                }
            })

            // ── Result Logging ──
            logger.success("Đã hoàn tất luồng Canva Business invite và đặt lại mật khẩu")
            if (!config.general.canvaEnableMfa) {
                logger.info("Đã đổi mật khẩu Canva; bỏ qua 2FA theo cấu hình.")
            } else {
                if (result.login?.status === "logged-in") logger.success("Đã đăng nhập lại Canva")
                else logger.info("Canva đã đăng nhập; bỏ qua form đăng nhập.")
                if (result.mfa?.status === "enabled") logger.success("Đã bật 2FA Canva và lưu TOTP secret + 10 mã dự phòng mã hóa vào vault local")
                else logger.info("2FA Canva đã bật sẵn; không thay đổi TOTP secret hiện có")
            }
            if (result.leonardo) {
                const d = result.leonardo.details
                logger.success(`Leonardo: ${d.plan} | Tokens: ${d.subscriptionTokens} | Username: ${d.username}`)
            }
            if (result.cookies) {
                logger.success(`Đã xuất ${result.cookies.canvaCookies.length} cookies Canva + ${result.cookies.leonardoCookies.length} cookies Leonardo`)
                logger.info(`Cookies file: data/cookies/${mailbox}.json`)
            }
        } finally {
            vault?.close()
        }
    } finally {
        await adapter.close(session)
        await proxyManager.releaseAll([resolved])
    }
}

if (process.argv[1]?.endsWith("canva-invite-login.ts") || process.argv[1]?.endsWith("canva-invite-login.js")) {
    loadConfig().then(config => runCanvaInviteLogin(
        parseCanvaInviteLoginArgs(process.argv.slice(2), {
            allowGeneratedEmail: config.general.serviceMail === "custom",
            allowGeneratedName: config.general.serviceMail === "custom"
        }),
        config
    )).catch(error => {
        logger.error(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
    })
}
