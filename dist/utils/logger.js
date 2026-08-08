import chalk from "chalk";
export const logger = {
    info(message) {
        console.log(chalk.cyanBright(`ℹ ${message}`));
    },
    success(message) {
        console.log(chalk.greenBright(`✓ ${message}`));
    },
    warn(message) {
        console.log(chalk.yellowBright(`⚠ ${message}`));
    },
    error(message) {
        console.log(chalk.redBright(`✗ ${message}`));
    },
    debug(message) {
        console.log(chalk.gray(`• ${message}`));
    },
    update(message) {
        console.log(chalk.blueBright(`↻ ${message}`));
    },
    countdown(message) {
        process.stdout.write(`\r${chalk.yellow(`⏳ ${message}`)} `);
    }
};
