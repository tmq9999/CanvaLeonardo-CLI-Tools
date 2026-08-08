import chalk from "chalk"

export const logger = {
    info(message: string) {
        console.log(chalk.cyanBright(`ℹ ${message}`))
    },

    success(message: string) {
        console.log(chalk.greenBright(`✓ ${message}`))
    },

    warn(message: string) {
        console.log(chalk.yellowBright(`⚠ ${message}`))
    },

    error(message: string) {
        console.log(chalk.redBright(`✗ ${message}`))
    },

    debug(message: string) {
        console.log(chalk.gray(`• ${message}`))
    },

    update(message: string) {
        console.log(chalk.blueBright(`↻ ${message}`))
    },
    countdown(message: string) {
        process.stdout.write(`\r${chalk.yellow(`⏳ ${message}`)} `)
    }
}