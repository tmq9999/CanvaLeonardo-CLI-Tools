import chalk from "chalk";
const canva = [
    " ██████  █████  ███    ██ ██    ██  █████ ",
    "██      ██   ██ ████   ██ ██    ██ ██   ██",
    "██      ███████ ██ ██  ██ ██    ██ ███████",
    "██      ██   ██ ██  ██ ██  ██  ██  ██   ██",
    " ██████ ██   ██ ██   ████   █████   ██   ██"
];
const leonardo = [
    "██      ███████  ██████  ███    ██  █████  ██████  ██████   ██████ ",
    "██      ██      ██    ██ ████   ██ ██   ██ ██   ██ ██   ██ ██    ██",
    "██      █████   ██    ██ ██ ██  ██ ███████ ██████  ██   ██ ██    ██",
    "██      ██      ██    ██ ██  ██ ██ ██   ██ ██   ██ ██   ██ ██    ██",
    "███████ ███████  ██████  ██   ████ ██   ██ ██   ██ ██████   ██████ "
];
const banner = canva.map((line, index) => {
    const separator = ["    ██ ", "   ██  ", "  ██   ", " ██    ", "██     "][index];
    return `${line}   ${separator}   ${leonardo[index]}`;
}).join("\n");
const bannerWidth = Math.max(...banner.split("\n").map(line => line.length));
function center(text) {
    const padding = Math.max(0, Math.floor((bannerWidth - text.length) / 2));
    return `${" ".repeat(padding)}${text}`;
}
export function clearScreen() {
    console.clear();
    console.log(chalk.greenBright.bold(banner));
    console.log();
    console.log(chalk.redBright.bold(center("CLI TOOLS  VER 0.1.0")));
    console.log();
    console.log(chalk.blueBright.bold(center("https://github.com/tmq9999/CanvaLeonardo-CLI-Tools.git")));
    console.log(chalk.gray("-----------------------------------------------------------------"));
    console.log();
}
