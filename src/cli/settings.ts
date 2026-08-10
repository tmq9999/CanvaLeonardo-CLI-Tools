import { checkbox, input, password, select } from "@inquirer/prompts"
import chalk from "chalk"
import {
    type AppConfig,
    type CustomMailDomainMode,
    loadConfig,
    saveConfig,
    passwordStatus,
    validateDelay,
    validatePort,
    validateThreads,
    validateTxtPath,
    withRefreshedCustomMailDomains
} from "../core/config.js"
import { CustomMailWorkerClient } from "../services/custom-mail.js"
import { GpmLoginClient, type GpmGroup } from "../services/gpmlogin.js"
import { clearScreen } from "../utils/screen.js"

export async function settings(): Promise<void> {
    let config = await loadConfig()

    while (true) {
        const selected = await select({
            message: chalk.yellow("Menu cài đặt tools (Settings Menu)\n"),
            choices: [
                { name: "Cài đặt chung (General)", value: "general" },
                { name: "Cài đặt proxy (Proxy)", value: "proxy" },
                { name: "Cài đặt trình duyệt (Browser)", value: "browser" },
                { name: "Quay lại (Main menu)", value: "back" }
            ]
        })

        if (selected === "back") return
        if (selected === "general") {
            clearScreen()
            config = await generalSettings(config)
            clearScreen()
        }
        if (selected === "proxy") {
            clearScreen()
            config = await proxySettings(config)
            clearScreen()
        }
        if (selected === "browser") {
            clearScreen()
            config = await browserSettings(config)
            clearScreen()
        }
    }
}

async function persist(config: AppConfig, message: string): Promise<AppConfig> {
    await saveConfig(config)
    clearScreen()
    console.log(chalk.green(`✓ ${message}`))
    return config
}

async function generalSettings(config: AppConfig): Promise<AppConfig> {
    while (true) {
        const setting = await select({
            message: chalk.yellow("Cài đặt chung (chọn mục muốn chỉnh sửa)\n"),
            choices: [
                { name: `Số luồng song song [${config.general.parallelThreads}]`, value: "threads" },
                { name: `Số vòng [${config.general.totalRounds}]`, value: "rounds" },
                { name: `Thời gian chờ [${config.general.operationDelaySeconds}s]`, value: "delay" },
                { name: `Service Mail [${config.general.serviceMail}]`, value: "mail" },
                { name: `Mật khẩu Canva [${passwordStatus(config.general.canvaPassword)}]`, value: "password" },
                { name: `Bật 2FA Canva [${config.general.canvaEnableMfa ? "Có" : "Không"}]`, value: "canva-mfa" },
                { name: `Tự động login Leonardo [${config.general.leonardoAutoLogin ? "Có" : "Không"}]`, value: "leonardo" },
                { name: `Hiện cửa sổ browser [${config.general.browserVisible ? "Có" : "Không"}]`, value: "visible" },
                { name: "Quay lại (Back)", value: "back" }
            ]
        })
        if (setting === "back") return config

        if (setting === "threads") {
            const value = Number(await input({ message: "Số luồng song song:", default: String(config.general.parallelThreads), validate: validateThreads }))
            config = await persist({ ...config, general: { ...config.general, parallelThreads: value } }, "Đã lưu số luồng song song")
        } else if (setting === "rounds") {
            const value = Number(await input({ message: "Số vòng (1-100):", default: String(config.general.totalRounds), validate: v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 100 ? true : "Nhập số nguyên từ 1 đến 100" } }))
            config = await persist({ ...config, general: { ...config.general, totalRounds: value } }, "Đã lưu số vòng")
        } else if (setting === "delay") {
            const value = Number(await input({ message: "Thời gian chờ giữa các thao tác (giây):", default: String(config.general.operationDelaySeconds), validate: validateDelay }))
            config = await persist({ ...config, general: { ...config.general, operationDelaySeconds: value } }, "Đã lưu thời gian chờ")
        } else if (setting === "mail") {
            const value = await select({
                message: chalk.yellow("Service Mail:"),
                default: config.general.serviceMail,
                choices: [
                    { name: "Hotmail/Outlook", value: "hotmail-outlook" },
                    { name: "Adguard Mail", value: "adguard-mail" },
                    { name: "Gmail", value: "gmail" },
                    { name: "Custom Mail (Faker + Worker domain)", value: "custom" }
                ]
            })
            config = await persist({ ...config, general: { ...config.general, serviceMail: value } }, "Đã lưu Service Mail")
            if (value === "custom") config = await customMailSettings(config)
        } else if (setting === "password") {
            const value = await password({
                message: "Mật khẩu Canva mới (để trống dùng mật khẩu mặc định):",
                mask: "*"
            })
            config = await persist(withCanvaPassword(config, value), "Đã lưu mật khẩu Canva")
        } else if (setting === "canva-mfa") {
            const value = await checkbox({
                message: chalk.yellow("Bật 2FA Canva sau khi đổi mật khẩu? (Space để bật/tắt, Enter để lưu)"),
                choices: [{ name: "Đăng nhập lại và bật 2FA Canva", value: "enabled", checked: config.general.canvaEnableMfa }]
            })
            config = await persist({ ...config, general: { ...config.general, canvaEnableMfa: value.includes("enabled") } }, "Đã lưu tùy chọn 2FA Canva")
        } else if (setting === "leonardo") {
            const value = await checkbox({
                message: chalk.yellow("Tự động đăng nhập Leonardo sau flow Canva? (Space để bật/tắt, Enter để lưu)"),
                choices: [{ name: "Tự động login Leonardo.ai", value: "enabled", checked: config.general.leonardoAutoLogin }]
            })
            config = await persist({ ...config, general: { ...config.general, leonardoAutoLogin: value.includes("enabled") } }, "Đã lưu tùy chọn Leonardo auto-login")
        } else if (setting === "visible") {
            const value = await checkbox({
                message: chalk.yellow("Hiện cửa sổ trình duyệt? (Space để bật/tắt, Enter để lưu)"),
                choices: [{ name: "Hiện cửa sổ browser", value: "visible", checked: config.general.browserVisible }]
            })
            config = await persist({ ...config, general: { ...config.general, browserVisible: value.includes("visible") } }, "Đã lưu chế độ hiển thị browser")
        }
    }
}

export function withCanvaPassword(config: AppConfig, value: string): AppConfig {
    const password = value.trim()
    return {
        ...config,
        general: {
            ...config.general,
            ...(password ? { canvaPassword: password } : { canvaPassword: undefined })
        }
    }
}

export function withCustomMailSelection(config: AppConfig, domainMode: CustomMailDomainMode, selectedDomains: string[]): AppConfig {
    const available = new Set(config.general.customMail.domains)
    const selected = [...new Set(selectedDomains.map(domain => domain.trim().toLowerCase()))]
        .filter(domain => available.has(domain))
    return {
        ...config,
        general: {
            ...config.general,
            customMail: {
                ...config.general.customMail,
                domainMode,
                selectedDomains: selected
            }
        }
    }
}

async function customMailSettings(config: AppConfig): Promise<AppConfig> {
    let current = config
    if (current.general.customMail.domains.length === 0) current = await refreshCustomMailDomains(current)

    while (true) {
        const setting = await select({
            message: chalk.yellow("Custom Mail (Faker + Worker domain)\n"),
            choices: [
                { name: `Chế độ domain [${current.general.customMail.domainMode === "all-random" ? "Random toàn bộ" : "Chọn domain"}]`, value: "mode" },
                { name: `Chọn domain [${current.general.customMail.selectedDomains.length}/${current.general.customMail.domains.length}]`, value: "domains" },
                { name: "Cập nhật domains từ Worker", value: "refresh" },
                { name: "Quay lại (Back)", value: "back" }
            ]
        })
        if (setting === "back") return current

        if (setting === "mode") {
            const mode = await select({
                message: "Chế độ chọn domain:",
                default: current.general.customMail.domainMode,
                choices: [
                    { name: "Random toàn bộ domain", value: "all-random" },
                    { name: "Random trong domain đã chọn", value: "selected-random" }
                ]
            }) as CustomMailDomainMode
            current = await persist(withCustomMailSelection(current, mode, current.general.customMail.selectedDomains), "Đã lưu chế độ Custom Mail")
        } else if (setting === "domains") {
            if (current.general.customMail.domains.length === 0) {
                console.log(chalk.red("✗ Chưa có domain. Hãy cập nhật từ Worker."))
                continue
            }
            const selected = await checkbox({
                message: "Tick domain muốn dùng khi chọn chế độ Chọn domain:",
                choices: current.general.customMail.domains.map(domain => ({
                    name: domain,
                    value: domain,
                    checked: current.general.customMail.selectedDomains.includes(domain)
                }))
            })
            current = await persist(withCustomMailSelection(current, "selected-random", selected), "Đã lưu domain Custom Mail đã chọn")
        } else if (setting === "refresh") {
            current = await refreshCustomMailDomains(current)
        }
    }
}

async function refreshCustomMailDomains(config: AppConfig): Promise<AppConfig> {
    try {
        const domains = await new CustomMailWorkerClient(config.general.customMail.workerUrl).listActiveDomains()
        if (domains.length === 0) throw new Error("Worker không có domain active")
        return persist(withRefreshedCustomMailDomains(config, domains), "Đã cập nhật domain Custom Mail")
    } catch (error) {
        console.log(chalk.red(`✗ ${error instanceof Error ? error.message : "Không thể cập nhật domain từ Worker"}`))
        return config
    }
}

async function proxySettings(config: AppConfig): Promise<AppConfig> {
    const mode = await select({
        message: chalk.yellow("Cài đặt Proxy Scheme / Kiot Proxy\n"),
        default: config.proxy.mode,
        choices: [
            { name: "Không dùng proxy (None)", value: "none" },
            { name: "Kiot Proxy (proxy key từ file .txt)", value: "kiot" },
            { name: "Proxy Scheme (http://ip:port:user:pass từ file .txt)", value: "file" },
            { name: "Quay lại (Back)", value: "back" }
        ]
    })
    if (mode === "back") return config

    const filePath = mode === "none"
        ? ""
        : await input({
            message: chalk.yellow(mode === "kiot" ? "Đường dẫn file Kiot Proxy key (.txt):" : "Đường dẫn file Proxy Scheme (.txt):"),
            default: config.proxy.filePath,
            validate: validateTxtPath
        })
    const updated = { ...config, proxy: { mode, filePath } }
    return persist(updated, "Đã lưu cài đặt proxy")
}

async function browserSettings(config: AppConfig): Promise<AppConfig> {
    const engine = await select({
        message: chalk.yellow("Cài đặt trình duyệt\n"),
        default: config.browser.engine,
        choices: [
            { name: "Chromium", value: "chromium" },
            { name: "GPM Login", value: "gpm" },
            { name: "Camoufox", value: "camoufox" },
            { name: "Quay lại (Back)", value: "back" }
        ]
    })
    if (engine === "back") return config

    if (engine === "gpm") {
        const updated = await configureGpmBrowser(config, defaultGpmSettingsDependencies(config))
        return updated === config ? config : persist(updated, "Đã lưu cài đặt GPM Login và group")
    }

    if (engine === "chromium") {
        return persist({ ...config, browser: { ...config.browser, engine } }, "Đã lưu cài đặt Chromium")
    }

    const mode = await select({
        message: chalk.yellow("Cấu hình Camoufox\n"),
        default: config.browser.camoufox.mode,
        choices: [
            { name: "Default", value: "default" },
            { name: "Tùy chỉnh (Custom)", value: "custom" },
            { name: "Quay lại (Back)", value: "back" }
        ]
    })
    if (mode === "back") return config

    const options = mode === "custom"
        ? await checkbox({
            message: chalk.yellow("Chọn tùy chọn Camoufox:"),
            choices: [
                { name: "Vị trí theo IP (GeoIP)", value: "geoip", checked: config.browser.camoufox.options.geoip },
                { name: "Humanize", value: "humanize", checked: config.browser.camoufox.options.humanize },
                { name: "Block WebRTC", value: "blockWebRTC", checked: config.browser.camoufox.options.blockWebRTC },
                { name: "Block WebGL", value: "blockWebGL", checked: config.browser.camoufox.options.blockWebGL },
                { name: "Block Image", value: "blockImage", checked: config.browser.camoufox.options.blockImage }
            ]
        })
        : []
    const selected = new Set(options)
    const updated = {
        ...config,
        browser: {
            ...config.browser,
            engine,
            camoufox: {
                mode,
                options: {
                    geoip: selected.has("geoip"),
                    humanize: selected.has("humanize"),
                    blockWebRTC: selected.has("blockWebRTC"),
                    blockWebGL: selected.has("blockWebGL"),
                    blockImage: selected.has("blockImage")
                }
            }
        }
    }
    return persist(updated, "Đã lưu cài đặt Camoufox")
}

type GpmSettingsClient = {
    connect(): Promise<unknown>
    listGroups(): Promise<GpmGroup[]>
}

export type GpmSettingsDependencies = {
    inputPort(): Promise<string>
    selectRetry(): Promise<"retry" | "back">
    selectGroup(groups: GpmGroup[]): Promise<string>
    createClient(port: number): GpmSettingsClient
    notifyError(message: string): void
}

export async function configureGpmBrowser(config: AppConfig, dependencies: GpmSettingsDependencies): Promise<AppConfig> {
    while (true) {
        const port = Number(await dependencies.inputPort())
        const client = dependencies.createClient(port)
        try {
            await client.connect()
            const groups = await client.listGroups()
            if (groups.length === 0) throw new Error("GPM Login không có group để chọn")
            const groupId = await dependencies.selectGroup(groups)
            const group = groups.find(candidate => candidate.id === groupId)
            if (!group) throw new Error("Group GPM Login đã chọn không hợp lệ")
            return {
                ...config,
                browser: {
                    ...config.browser,
                    engine: "gpm",
                    gpmPort: port,
                    gpmGroupId: group.id,
                    gpmGroupName: group.name
                }
            }
        } catch (error) {
            dependencies.notifyError(error instanceof Error ? error.message : "Không thể kết nối GPM Login")
            if (await dependencies.selectRetry() === "back") return config
        }
    }
}

function defaultGpmSettingsDependencies(config: AppConfig): GpmSettingsDependencies {
    return {
        inputPort: () => input({
            message: "Port GPM Login:",
            default: String(config.browser.gpmPort),
            validate: validatePort
        }),
        selectRetry: () => select({
            message: chalk.yellow("Kết nối hoặc tải group GPM thất bại."),
            choices: [
                { name: "Thử lại (Retry)", value: "retry" },
                { name: "Quay lại (Back)", value: "back" }
            ]
        }) as Promise<"retry" | "back">,
        selectGroup: groups => select({
            message: chalk.yellow("Chọn một group GPM Login:"),
            choices: groups.map(group => ({ name: group.name, value: group.id }))
        }),
        createClient: port => new GpmLoginClient(port),
        notifyError: message => console.log(chalk.red(`✗ ${message}`))
    }
}
