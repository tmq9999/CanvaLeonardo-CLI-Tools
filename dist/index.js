import { checkUpdateTools } from './utils/update.js';
import { mainMenu } from './utils/menu.js';
async function main() {
    await checkUpdateTools();
    await mainMenu();
}
await main();
// await settings();
// const canvaLink = 'https://www.canva.com/'
// const browser = await firefox.launch({
//     ...await launchOptions(
//         {
//             os: ['linux', 'macos', 'windows'],
//             locale: 'en-US',
//             headless: false,
//             humanize: true,
//         })
// })
// const page = await browser.newPage()
// await page.goto(canvaLink, { waitUntil: 'domcontentloaded', timeout: 30000 })
// try {
//     await page.getByRole('button', { name: /continue\s+with email/i }).waitFor({ state: 'visible', timeout: 10000 })
//     await page.getByRole('button', { name: /continue\s+with email/i }).click({ force: true })
//     await page.locator('input[inputmode="email"]').waitFor({ state: 'visible', timeout: 10000 })
//     await page.locator('input[inputmode="email"]').clear()
//     await page.locator('input[inputmode="email"]').fill('7tv65wge2@mozmail.com')
// } catch (err) {
//     console.error(err instanceof Error ? err.message : String(err))
// }
