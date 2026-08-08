import type { AppConfig } from "./config.js"
import { createRuntimeAdapter, ProxyManager, reportCleanupError, type RuntimeDependencies } from "./workers.js"
import type { BrowserLaunchOptions, BrowserSession } from "../utils/browser.js"

export type BrowserTask = (session: BrowserSession) => Promise<void>

export type BrowserRuntimeOptions = RuntimeDependencies & {
    profileId?: string
}

export async function runBrowserRuntime(
    config: AppConfig,
    task: BrowserTask,
    options: BrowserRuntimeOptions = {}
): Promise<void> {
    const proxyManager = new ProxyManager(config, options)
    const proxies = await proxyManager.resolveAll()
    const cleanupErrors: unknown[] = []
    let primaryError: unknown

    try {
        const adapter = createRuntimeAdapter(config, options)
        for (const resolved of proxies) {
            const session = await adapter.launch(buildBrowserLaunchOptions(config, resolved.proxy, options.profileId))
            try {
                await task(session)
            } catch (error) {
                primaryError = error
                break
            } finally {
                try {
                    await adapter.close(session)
                } catch (error) {
                    cleanupErrors.push(error)
                    reportCleanupError(options, error)
                }
            }
            if (primaryError) break
        }
    } finally {
        await proxyManager.releaseAll(proxies)
    }

    if (primaryError) throw primaryError
    if (cleanupErrors.length === 1) throw cleanupErrors[0]
    if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "Browser runtime cleanup failed")
}

export function buildBrowserLaunchOptions(
    config: AppConfig,
    proxy: BrowserLaunchOptions["proxy"],
    profileId?: string
): BrowserLaunchOptions {
    return {
        visible: config.general.browserVisible,
        ...(proxy ? { proxy } : {}),
        ...(profileId ? { profileId } : {}),
        ...(config.browser.engine === "camoufox" ? { camoufox: config.browser.camoufox.options } : {})
    }
}
