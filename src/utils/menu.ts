import { settings } from "../cli/settings.js"
import { exportAccountData } from "../cli/export-data.js"
import { input, select, confirm } from "@inquirer/prompts"
import chalk from "chalk"
import { clearScreen } from "./screen.js"
import { loadConfig } from "../core/config.js"
import { runCanvaInviteLogin, type CanvaInviteLoginArgs } from "../cli/canva-invite-login.js"
import type { AppConfig } from "../core/config.js"
import { logger } from "./logger.js"

export type StartCanvaPreviewDependencies = {
    inputInvite?(): Promise<string>
    loadConfig?(): Promise<AppConfig>
    runInviteLogin?(args: CanvaInviteLoginArgs, config: AppConfig): Promise<void>
}

export type StartCanvaPreviewLoopDependencies = StartCanvaPreviewDependencies & {
    clearScreen?(): void
    shouldContinue?(): Promise<boolean>
    waitForContinue?(): Promise<void>
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

    const config = await (dependencies.loadConfig ?? loadConfig)()
    const runInviteLogin = dependencies.runInviteLogin ?? runCanvaInviteLogin
    await runInviteLogin({ inviteUrl }, config)
}

export async function startCanvaPreviewLoop(dependencies: StartCanvaPreviewLoopDependencies = {}): Promise<void> {
    const shouldContinue = dependencies.shouldContinue ?? (async () => true)
    const waitForContinue = dependencies.waitForContinue ?? (async () => {
        console.log()
        await input({ message: chalk.yellow("Nhấn Enter để tiếp tục..."), theme: { prefix: { idle: "⏎", done: "⏎" } } })
    })
    const getConfig = dependencies.loadConfig ?? loadConfig
    const runInviteLogin = dependencies.runInviteLogin ?? runCanvaInviteLogin

    // Load config to get totalRounds and parallelThreads
    const config = await getConfig()
    const totalRounds = Math.max(1, Math.min(100, config.general.totalRounds))
    const threads = Math.max(1, config.general.parallelThreads)

    // Ask for invite URL once
    const inviteUrl = (await (dependencies.inputInvite ?? (() => input({
        message: "Nhập link invite canva:",
        theme: invitePromptTheme
    })) )()).trim()
    if (!inviteUrl) {
        logger.error("Link invite Canva không được để trống")
        return
    }

    logger.resetRound()
    logger.info(`Bắt đầu ${totalRounds} vòng × ${threads} luồng = ${totalRounds * threads} tài khoản`)
    console.log(chalk.gray("─".repeat(60)))

    for (let round = 1; round <= totalRounds; round += 1) {
        console.log()
        console.log(chalk.cyan(`══════ Vòng ${round}/${totalRounds} ══════`))

        if (threads > 1) {
            // Parallel: run N accounts simultaneously
            const tasks = Array.from({ length: threads }, (_, i) => (async () => {
                try {
                    await runInviteLogin({ inviteUrl }, config)
                } catch (error) {
                    if (error instanceof Error && error.name === "ExitPromptError") throw error
                    logger.error(`Thread ${i + 1}: ${error instanceof Error ? error.message : String(error)}`)
                }
            })())
            const results = await Promise.allSettled(tasks)
            // Re-throw ExitPromptError if any
            for (const result of results) {
                if (result.status === "rejected" && result.reason instanceof Error && result.reason.name === "ExitPromptError") {
                    throw result.reason
                }
            }
        } else {
            // Sequential: single account
            try {
                await runInviteLogin({ inviteUrl }, config)
            } catch (error) {
                if (error instanceof Error && error.name === "ExitPromptError") throw error
                logger.error(`Không thể chạy flow Canva: ${error instanceof Error ? error.message : String(error)}`)
            }
        }

        // Increment round counter (for logger prefix)
        if (round < totalRounds) {
            logger.nextRound()
        }
    }

    // Summary
    console.log()
    console.log(chalk.gray("─".repeat(60)))
    logger.success(`Đã hoàn tất ${totalRounds} vòng`)

    await waitForContinue()
    if (!await shouldContinue()) return
}

export async function mainMenu(): Promise<void> {
    while (true) {
        const selected = await select({
            message: chalk.yellow("Main menu\n"),
            choices: [
                { name: "Bắt đầu", value: "start" },
                { name: "Cài đặt", value: "settings" },
                { name: "Xuất Data", value: "export" },
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

        if (selected === "export") {
            const clearDb = await confirm({
                message: chalk.yellow("Clear DB sau khi xuất?"),
                default: false
            })
            try {
                await exportAccountData({ clearAfterExport: clearDb })
            } catch (error) {
                logger.error(`Xuất dữ liệu thất bại: ${error instanceof Error ? error.message : String(error)}`)
            }
            console.log()
            await input({ message: chalk.yellow("Nhấn Enter để tiếp tục..."), theme: { prefix: { idle: "⏎", done: "⏎" } } })
            clearScreen()
            continue
        }

        clearScreen()
        return
    }
}
