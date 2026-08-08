import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { logger } from "./logger.js"
import { clearScreen } from "./screen.js"

const require = createRequire(import.meta.url)

function isCamoufoxInstalled(): boolean {
    try {
        require.resolve("camoufox-js")
        return true
    } catch {
        return false
    }
}

async function installCamoufox(): Promise<void> {
    if (isCamoufoxInstalled()) {
        logger.success("camoufox-js đã được cài đặt")
        return
    }

    logger.warn("Không tìm thấy camoufox-js")
    logger.update("Đang cài đặt camoufox-js...")

    await new Promise<void>((resolve, reject) => {
        const child = process.platform === "win32"
            ? spawn(
                "cmd.exe",
                ["/c", "npm", "install", "camoufox-js"],
                { stdio: "inherit" }
            )
            : spawn(
                "npm",
                ["install", "camoufox-js"],
                { stdio: "inherit" }
            )

        child.on("error", reject)

        child.on("close", code => {
            if (code === 0) {
                resolve()
                return
            }

            reject(
                new Error(`npm install camoufox-js exited với code ${code}`)
            )
        })
    })
    clearScreen()
    logger.success("Đã cài đặt camoufox-js")
}

async function updateCamoufox(): Promise<void> {
    logger.warn("Kiểm tra bản cập nhật mới nhất CamoufoxBrowser...")

    await new Promise<void>((resolve, reject) => {
        const isWindows = process.platform === "win32"

        const child = isWindows
            ? spawn(
                "cmd.exe",
                ["/c", "npx", "camoufox-js", "fetch"],
                { stdio: "inherit" }
            )
            : spawn(
                "npx",
                ["camoufox-js", "fetch"],
                { stdio: "inherit" }
            )

        child.on("error", reject)

        child.on("close", (code) => {
            if (code === 0) {
                resolve()
            } else {
                reject(
                    new Error(`camoufox-js fetch exited với code ${code}`)
                )
            }
        })
    })
    clearScreen()
    logger.success("CamoufoxBrowser đã sẵn sàng!...")
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function countdownClear(seconds = 3): Promise<void> {
    for (let i = seconds; i > 0; i--) {
        logger.countdown(`Hoàn tất update, tiếp tục sau ${i}s...`)
        await sleep(1000)
    }
    clearScreen()
}

export async function checkUpdateTools(): Promise<void> {
    await installCamoufox()
    await updateCamoufox()

    //đếm ngược clear console
    await countdownClear(3)
}
