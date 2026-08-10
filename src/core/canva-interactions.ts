export type StableLocator = {
    count?(): Promise<number>
    waitFor(options: { state: "visible" | "hidden" | "detached", timeout: number }): Promise<void>
    click?(): Promise<void>
    fill?(value: string): Promise<void>
}
export type StablePage = { locator(selector: string): StableLocator; waitForTimeout?(milliseconds: number): Promise<void> }
type Range = readonly [number, number]
export type StableActionOptions = { random?: () => number; preDelay?: Range; postDelay?: Range; elementTimeout?: number; transitionTimeout?: number }
const overlays = ["div[class*='underlay']", "[data-overlay-container='true'] [role='progressbar']", "[aria-busy='true']", "[role='progressbar']"]
export async function stableClick(page: StablePage, selector: string, options: StableActionOptions = {}): Promise<void> {
    const locator = page.locator(selector)
    await locator.waitFor({ state: "visible", timeout: options.elementTimeout ?? 30_000 })
    await delay(page, randomMs(options.preDelay ?? [500, 1_500], options.random))
    if (!locator.click) throw new Error(`Element không hỗ trợ click: ${selector}`)
    await locator.click()
    await waitForCanvaIdle(page, options.transitionTimeout ?? 60_000)
    await delay(page, randomMs(options.postDelay ?? [2_000, 5_000], options.random))
}
export async function stableFill(page: StablePage, selector: string, value: string, options: StableActionOptions = {}): Promise<void> {
    const locator = page.locator(selector)
    await locator.waitFor({ state: "visible", timeout: options.elementTimeout ?? 30_000 })
    await delay(page, randomMs(options.preDelay ?? [500, 1_500], options.random))
    if (!locator.fill) throw new Error(`Element không hỗ trợ fill: ${selector}`)
    await locator.fill(value)
    await delay(page, randomMs(options.postDelay ?? [500, 1_500], options.random))
}
export async function waitForCanvaIdle(page: StablePage, timeout = 60_000): Promise<void> {
    for (const selector of overlays) {
        const locator = page.locator(selector)
        if (locator.count && await locator.count() === 0) continue
        await locator.waitFor({ state: "hidden", timeout })
    }
}
function randomMs([minimum, maximum]: Range, random = Math.random): number { return Math.round(minimum + (maximum - minimum) * random()) }
async function delay(page: StablePage, milliseconds: number): Promise<void> {
    if (page.waitForTimeout) await page.waitForTimeout(milliseconds)
    else await new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}
