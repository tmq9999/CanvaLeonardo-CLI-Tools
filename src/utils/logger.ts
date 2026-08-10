import chalk from "chalk"

let currentRound = 1

function timestamp(): string {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, "0")
    const m = String(now.getMinutes()).padStart(2, "0")
    const s = String(now.getSeconds()).padStart(2, "0")
    return `${h}:${m}:${s}`
}

function prefix(icon: string): string {
    return `${chalk.gray(timestamp())} - ${chalk.white(`[${currentRound}]`)} - ${icon}`
}

export const logger = {
    info(message: string) {
        console.log(`${prefix(chalk.cyanBright("ℹ"))} ${chalk.cyanBright(message)}`)
    },

    success(message: string) {
        console.log(`${prefix(chalk.greenBright("✓"))} ${chalk.greenBright(message)}`)
    },

    warn(message: string) {
        console.log(`${prefix(chalk.yellowBright("⚠"))} ${chalk.yellowBright(message)}`)
    },

    error(message: string) {
        console.log(`${prefix(chalk.redBright("✗"))} ${chalk.redBright(message)}`)
    },

    debug(message: string) {
        console.log(`${prefix(chalk.gray("•"))} ${chalk.gray(message)}`)
    },

    update(message: string) {
        console.log(`${prefix(chalk.blueBright("↻"))} ${chalk.blueBright(message)}`)
    },

    countdown(message: string) {
        process.stdout.write(`\r${prefix(chalk.yellow("⏳"))} ${chalk.yellow(message)} `)
    },

    nextRound() {
        currentRound += 1
    },

    getRound(): number {
        return currentRound
    },

    resetRound() {
        currentRound = 1
    }
}