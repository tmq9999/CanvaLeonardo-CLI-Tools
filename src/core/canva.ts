import type { BrowserSession } from "../utils/browser.js"
import { logger } from "../utils/logger.js"

type CanvaPage = {
    goto(url: string): Promise<unknown>
}

export async function openCanvaInvite(session: BrowserSession, inviteUrl: string): Promise<void> {
    const url = inviteUrl.trim()
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        throw new Error("Invite URL không hợp lệ")
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Invite URL phải dùng http hoặc https")
    }

    try {
        const response = await (session.page as CanvaPage).goto(url)
        const status = response && typeof response === "object" && "status" in response && typeof response.status === "function"
            ? response.status()
            : undefined
        if (typeof status === "number" && (status < 200 || status >= 400)) {
            throw new Error(`Canva trả về HTTP ${status}`)
        }
        logger.success(`Đã mở invite Canva${typeof status === "number" ? ` (HTTP ${status})` : ""}`)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const userMessage = navigationErrorMessage(message)
        logger.error(userMessage)
        if (userMessage === message) throw error
        throw new Error(userMessage, { cause: error })
    }
}

function navigationErrorMessage(message: string): string {
    if (message.includes("NS_ERROR_PROXY_CONNECTION_REFUSED") || message.includes("ERR_PROXY_CONNECTION_REFUSED")) {
        return "Proxy từ chối kết nối tới máy chủ proxy"
    }
    if (message.includes("Timeout") || message.includes("timed out")) {
        return "Hết thời gian chờ khi mở invite Canva"
    }
    if (message.startsWith("Canva trả về HTTP")) return message
    return "Không thể điều hướng tới invite Canva"
}
