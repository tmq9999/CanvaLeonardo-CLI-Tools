
import { checkUpdateTools } from './utils/update.js'
import { mainMenu } from './utils/menu.js'
import { clearScreen } from './utils/screen.js'


async function main(): Promise<void> {
    clearScreen()
    await checkUpdateTools()
    await mainMenu()
}

await main()
