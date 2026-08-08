import { settings } from "../cli/settings.js"
import { select } from "@inquirer/prompts"
import chalk from "chalk"
import { clearScreen } from "./screen.js"
import { loadConfig } from "../core/config.js"
import { runBrowserRuntime } from "../core/script.js"

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
            clearScreen()
            try {
                await runBrowserRuntime(await loadConfig(), async () => {
                    console.log("Browser runtime đã sẵn sàng cho tác vụ tự động hóa.")
                })
            } catch (error) {
                console.log(chalk.red(`Không thể khởi động browser runtime: ${error instanceof Error ? error.message : String(error)}`))
            }
            continue
        }

        clearScreen()
        return
    }
}
