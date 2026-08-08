import { settings } from "../cli/settings.js"
import { select } from "@inquirer/prompts"
import chalk from "chalk"

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
            console.clear()
            await settings()
            console.clear()
            continue
        }

        if (selected === "start") {
            console.clear()
            console.log("Tính năng Bắt đầu chưa được triển khai.")
            continue
        }

        console.clear()
        return
    }
}
