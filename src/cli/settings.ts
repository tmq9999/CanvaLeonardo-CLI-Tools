import { checkbox, input, select } from "@inquirer/prompts"
import chalk from "chalk"
import {
    type AppConfig,
    loadConfig,
    saveConfig,
    validateDelay,
    validatePort,
    validateThreads,
    validateTxtPath
} from "../core/config.js"
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
                { name: `Thời gian chờ [${config.general.operationDelaySeconds}s]`, value: "delay" },
                { name: `Service Mail [${config.general.serviceMail}]`, value: "mail" },
                { name: `Hiện cửa sổ browser [${config.general.browserVisible ? "Có" : "Không"}]`, value: "visible" },
                { name: "Quay lại (Back)", value: "back" }
            ]
        })
        if (setting === "back") return config

        if (setting === "threads") {
            const value = Number(await input({ message: "Số luồng song song:", default: String(config.general.parallelThreads), validate: validateThreads }))
            config = await persist({ ...config, general: { ...config.general, parallelThreads: value } }, "Đã lưu số luồng song song")
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
                    { name: "Gmail", value: "gmail" }
                ]
            })
            config = await persist({ ...config, general: { ...config.general, serviceMail: value } }, "Đã lưu Service Mail")
        } else if (setting === "visible") {
            const value = await checkbox({
                message: chalk.yellow("Hiện cửa sổ trình duyệt? (Space để bật/tắt, Enter để lưu)"),
                choices: [{ name: "Hiện cửa sổ browser", value: "visible", checked: config.general.browserVisible }]
            })
            config = await persist({ ...config, general: { ...config.general, browserVisible: value.includes("visible") } }, "Đã lưu chế độ hiển thị browser")
        }
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
            { name: "GPM Login", value: "gpm" },
            { name: "Camoufox", value: "camoufox" },
            { name: "Quay lại (Back)", value: "back" }
        ]
    })
    if (engine === "back") return config

    if (engine === "gpm") {
        const gpmPort = Number(await input({
            message: "Port GPM Login:",
            default: String(config.browser.gpmPort),
            validate: validatePort
        }))
        const updated = { ...config, browser: { ...config.browser, engine, gpmPort } }
        return persist(updated, "Đã lưu cài đặt GPM Login")
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
