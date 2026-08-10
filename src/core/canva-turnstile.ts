export type CanvaTurnstileLocator = {
    count(): Promise<number>
    waitFor?(options: { state: "hidden", timeout: number }): Promise<void>
}

export type CanvaTurnstilePage = {
    locator(selector: string): CanvaTurnstileLocator
}

export type CanvaTurnstileOptions = {
    minimumMs?: number
    maximumMs?: number
    sleep?: (milliseconds: number) => Promise<void>
    onDetected?(): void
}

const turnstileSelectors = [
    "input[name=cf-turnstile-response]",
    "iframe[src*='challenges.cloudflare.com']",
    "iframe[title*='Cloudflare']"
]

export async function waitForCanvaTurnstile(
    page: CanvaTurnstilePage,
    options: CanvaTurnstileOptions = {}
): Promise<"not-present" | "cleared"> {
    const locator = await findTurnstile(page)
    if (!locator) return "not-present"

    options.onDetected?.()
    const minimumMs = options.minimumMs ?? 30_000
    const maximumMs = options.maximumMs ?? 60_000
    const sleep = options.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))

    await Promise.all([
        locator.waitFor!({ state: "hidden", timeout: maximumMs }),
        sleep(minimumMs)
    ])
    return "cleared"
}

async function findTurnstile(page: CanvaTurnstilePage): Promise<CanvaTurnstileLocator | undefined> {
    for (const selector of turnstileSelectors) {
        const locator = page.locator(selector)
        try {
            if (await locator.count()) {
                if (!locator.waitFor) throw new Error("Canva page adapter không hỗ trợ locator.waitFor cho Turnstile.")
                return locator
            }
        } catch (error) {
            if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error
        }
    }
    return undefined
}
