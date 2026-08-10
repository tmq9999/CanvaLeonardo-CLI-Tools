export type CanvaStabilityPage = {
    waitForLoadState?(state?: "domcontentloaded"): Promise<unknown>
}

export type CanvaPageStabilityOptions = {
    minimumMs: number
    maximumMs: number
    isComplete?: () => Promise<boolean>
    now?: () => number
    sleep?: (milliseconds: number) => Promise<void>
}

const pollDelayMs = 250

export async function waitForCanvaPageStability(
    page: CanvaStabilityPage,
    options: CanvaPageStabilityOptions
): Promise<void> {
    const now = options.now ?? Date.now
    const sleep = options.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))
    const startedAt = now()
    let complete = !options.isComplete

    try { await page.waitForLoadState?.("domcontentloaded") }
    catch (error) {
        if (!isTransientNavigationError(error)) {
            // A bounded state check below remains authoritative when load-state support is unreliable.
        }
    }

    while (now() - startedAt < options.maximumMs) {
        if (!complete && options.isComplete) {
            try { complete = await options.isComplete() }
            catch (error) {
                if (!isTransientNavigationError(error)) throw error
            }
        }

        const elapsed = now() - startedAt
        if (complete && elapsed >= options.minimumMs) return
        const remaining = options.maximumMs - elapsed
        if (remaining <= 0) return
        await sleep(Math.min(pollDelayMs, remaining))
    }
}

function isTransientNavigationError(error: unknown): boolean {
    return error instanceof Error && error.message.includes("Execution context was destroyed")
}
