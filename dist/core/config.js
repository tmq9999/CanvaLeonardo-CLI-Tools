import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
export const DEFAULT_CONFIG = {
    general: {
        parallelThreads: 1,
        operationDelaySeconds: 0.5,
        serviceMail: "hotmail-outlook",
        browserVisible: true
    },
    proxy: { mode: "none", filePath: "" },
    browser: {
        engine: "gpm",
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
};
export const CONFIG_PATH = join(process.cwd(), "config.json");
function mergeConfig(value) {
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
    };
}
export async function loadConfig(filePath = CONFIG_PATH) {
    try {
        const content = await readFile(filePath, "utf8");
        return mergeConfig(JSON.parse(content));
    }
    catch (error) {
        if (error.code !== "ENOENT") {
            console.warn("Không thể đọc config.json, sử dụng cấu hình mặc định.");
        }
        return structuredClone(DEFAULT_CONFIG);
    }
}
export async function saveConfig(config, filePath = CONFIG_PATH) {
    await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
export function validateThreads(value) {
    return Number.isInteger(Number(value)) && Number(value) >= 1
        ? true
        : "Số luồng phải là số nguyên từ 1 trở lên";
}
export function validateDelay(value) {
    return Number.isFinite(Number(value)) && Number(value) >= 0
        ? true
        : "Thời gian chờ phải là số từ 0 trở lên";
}
export function validatePort(value) {
    return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 65535
        ? true
        : "Port phải là số nguyên từ 1 đến 65535";
}
export function validateTxtPath(value) {
    return value.trim().toLowerCase().endsWith(".txt")
        ? true
        : "Đường dẫn phải trỏ tới file .txt";
}
