import { settings } from "../cli/settings.js"
import { input, select } from "@inquirer/prompts"
import chalk from "chalk"
import { clearScreen } from "./screen.js"
import { loadConfig } from "../core/config.js"
import { runCanvaWorkers, type WorkerDependencies } from "../core/workers.js"
import type { AppConfig } from "../core/config.js"
import { logger } from "./logger.js"

export type StartCanvaPreviewDependencies = {
    inputInvite?(): Promise<string>
    loadConfig?(): Promise<AppConfig>
    runWorkers?(config: AppConfig, inviteUrl: string, options: WorkerDependencies): Promise<void>
    confirmInspection?(): Promise<void>
}

export type StartCanvaPreviewLoopDependencies = StartCanvaPreviewDependencies & {
    clearScreen?(): void
    shouldContinue?(): Promise<boolean>
}

const invitePromptTheme = {
    prefix: {
        idle: chalk.yellow("?"),
        done: chalk.greenBright("✓")
    },
    style: {
        message: (text: string, status: string) => status === "done"
            ? chalk.greenBright(text)
            : chalk.yellowBright(text),
        answer: (text: string) => chalk.greenBright(text)
    }
}

export async function startCanvaPreview(dependencies: StartCanvaPreviewDependencies = {}): Promise<void> {
    const inviteUrl = (await (dependencies.inputInvite ?? (() => input({
        message: "Nhập link invite canva:",
        theme: invitePromptTheme
    })) )()).trim()
    if (!inviteUrl) {
        logger.error("Link invite Canva không được để trống")
        return
    }

    const confirmInspection = dependencies.confirmInspection ?? (async () => {
        await input({ message: "Sau khi kiểm tra đủ browser, nhấn Enter để kết thúc phiên: " })
    })
    const runWorkers = dependencies.runWorkers ?? runCanvaWorkers
    await runWorkers(
        await (dependencies.loadConfig ?? loadConfig)(),
        inviteUrl,
        { confirmInspection }
    )
}

export async function startCanvaPreviewLoop(dependencies: StartCanvaPreviewLoopDependencies = {}): Promise<void> {
    const clear = dependencies.clearScreen ?? clearScreen
    const shouldContinue = dependencies.shouldContinue ?? (async () => true)

    while (true) {
        clear()
        try {
            await startCanvaPreview(dependencies)
        } catch (error) {
            if (error instanceof Error && error.name === "ExitPromptError") throw error
            logger.error(`Không thể khởi động worker Canva: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (!await shouldContinue()) return
    }
}

export async function mainMenu(): Promise<void> {
    while (true) {
        const selected = await select({
            message: chalk.yellow("Main menu\n"),
            choices: [
                { name: "Bắt đầu", value: "start" },
                { name: "Settings", value: "settings" },
                { name: "Thoát", value: "exit" }
            ]
        })

        if (selected === "settings") {
            clearScreen()
            await settings()
            clearScreen()
            continue
        }

        if (selected === "start") {
            await startCanvaPreviewLoop()
            continue
        }

        clearScreen()
        return
    }
}
