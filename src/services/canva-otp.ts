export type CanvaOtpResult = {
    otp: string
    sourceMail: string | null
}

export type CanvaOtpPurpose = "reset"

export type WaitForOtpOptions = {
    mailbox: string
    after: string
    retries?: number
    delayMs?: number
    scan?: number
    purpose?: CanvaOtpPurpose
}

type FetchLike = (request: Request) => Promise<Response>
type Delay = (milliseconds: number) => Promise<void>

export class CanvaOtpClient {
    constructor(
        private readonly baseUrl: string,
        private readonly token: string,
        private readonly fetchImpl: FetchLike = request => fetch(request),
        private readonly delay: Delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
    ) {
        if (!token.trim()) throw new Error("Thiếu CANVA_OTP_TOKEN")
    }

    async waitForOtp(options: WaitForOtpOptions): Promise<CanvaOtpResult> {
        const retries = options.retries ?? 30
        const delayMs = options.delayMs ?? 3000
        if (!options.mailbox.includes("@")) throw new Error("Email nhận OTP không hợp lệ")
        if (!Number.isInteger(retries) || retries < 1) throw new Error("Số lần chờ OTP không hợp lệ")

        for (let attempt = 1; attempt <= retries; attempt += 1) {
            const response = await this.fetchImpl(this.request(options))
            if (response.status === 404) {
                if (attempt < retries) await this.delay(delayMs)
                continue
            }
            if (!response.ok) throw new Error(`Worker OTP trả HTTP ${response.status}`)
            const payload = await response.json() as { otp?: unknown; source_mail?: unknown }
            if (typeof payload.otp !== "string" || !/^\d{4,8}$/.test(payload.otp)) {
                throw new Error("Worker OTP trả dữ liệu không hợp lệ")
            }
            return {
                otp: payload.otp,
                sourceMail: typeof payload.source_mail === "string" ? payload.source_mail : null
            }
        }
        throw new Error("Hết thời gian chờ OTP Canva")
    }

    private request(options: WaitForOtpOptions): Request {
        const url = new URL("/api/canva/otp", this.baseUrl)
        url.searchParams.set("mail", options.mailbox.trim().toLowerCase())
        url.searchParams.set("after", options.after)
        url.searchParams.set("scan", String(Math.min(Math.max(options.scan ?? 10, 1), 20)))
        if (options.purpose) url.searchParams.set("purpose", options.purpose)
        return new Request(url, { headers: { Authorization: `Bearer ${this.token}` } })
    }
}
