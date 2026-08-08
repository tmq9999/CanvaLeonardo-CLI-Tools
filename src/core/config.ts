import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export type ProxyMode = "none" | "kiot" | "file"
export type ServiceMail = "hotmail-outlook" | "adguard-mail" | "gmail"
export type BrowserEngine = "chromium" | "camoufox" | "gpm"
export type CamoufoxMode = "default" | "custom"

export interface AppConfig {
    general: {
        parallelThreads: number
        operationDelaySeconds: number
        serviceMail: ServiceMail
        browserVisible: boolean
    }
    proxy: {
        mode: ProxyMode
        filePath: string
    }
    browser: {
        engine: BrowserEngine
        gpmPort: number
        gpmGroupId?: string | null
        gpmGroupName?: string | null
        gpmProfileId?: string | null
        camoufox: {
            mode: CamoufoxMode
            options: {
                geoip: boolean
                humanize: boolean
                blockWebRTC: boolean
                blockWebGL: boolean
                blockImage: boolean
            }
        }
    }
}

export const DEFAULT_CONFIG: AppConfig = {
    general: {
        parallelThreads: 1,
        operationDelaySeconds: 0.5,
        serviceMail: "hotmail-outlook",
        browserVisible: true
    },
    proxy: { mode: "none", filePath: "" },
    browser: {
        engine: "chromium",
        gpmPort: 9495,
        camoufox: {
            mode: "default",
            options: {
                geoip: false,
                humanize: false,
                blockWebRTC: false,
                blockWebGL: false,
                blockImage: false
            }
        }
    }
}

export const CONFIG_PATH = join(process.cwd(), "config.json")

function mergeConfig(value: Partial<AppConfig>): AppConfig {
    return {
        ...DEFAULT_CONFIG,
        ...value,
        general: { ...DEFAULT_CONFIG.general, ...value.general },
        proxy: { ...DEFAULT_CONFIG.proxy, ...value.proxy },
        browser: {
            ...DEFAULT_CONFIG.browser,
            ...value.browser,
            camoufox: {
                ...DEFAULT_CONFIG.browser.camoufox,
                ...value.browser?.camoufox,
                options: {
                    ...DEFAULT_CONFIG.browser.camoufox.options,
                    ...value.browser?.camoufox?.options
                }
            }
        }
    }
}

export async function loadConfig(filePath = CONFIG_PATH): Promise<AppConfig> {
    try {
        const content = await readFile(filePath, "utf8")
        return mergeConfig(JSON.parse(content) as Partial<AppConfig>)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn("Không thể đọc config.json, sử dụng cấu hình mặc định.")
        }
        return structuredClone(DEFAULT_CONFIG)
    }
}

export async function saveConfig(config: AppConfig, filePath = CONFIG_PATH): Promise<void> {
    await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

export function validateThreads(value: string): string | true {
    return Number.isInteger(Number(value)) && Number(value) >= 1
        ? true
        : "Số luồng phải là số nguyên từ 1 trở lên"
}

export function validateDelay(value: string): string | true {
    return Number.isFinite(Number(value)) && Number(value) >= 0
        ? true
        : "Thời gian chờ phải là số từ 0 trở lên"
}

export function validatePort(value: string): string | true {
    return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535
        ? true
        : "Port phải là số nguyên từ 1 đến 65535"
}

export function validateTxtPath(value: string): string | true {
    return value.trim().toLowerCase().endsWith(".txt")
        ? true
        : "Đường dẫn phải trỏ tới file .txt"
}
