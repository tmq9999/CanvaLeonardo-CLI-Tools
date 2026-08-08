import { createRuntimeAdapter, ProxyManager, reportCleanupError } from "./workers.js";
export async function runBrowserRuntime(config, task, options = {}) {
    const proxyManager = new ProxyManager(config, options);
    const proxies = await proxyManager.resolveAll();
    const cleanupErrors = [];
    let primaryError;
    try {
        const adapter = createRuntimeAdapter(config, options);
        for (const resolved of proxies) {
            const session = await adapter.launch(buildBrowserLaunchOptions(config, resolved.proxy, options.profileId ?? config.browser.gpmProfileId ?? undefined));
            try {
                await task(session);
            }
            catch (error) {
                primaryError = error;
                break;
            }
            finally {
                try {
                    await adapter.close(session);
                }
                catch (error) {
                    cleanupErrors.push(error);
                    reportCleanupError(options, error);
                }
            }
            if (primaryError)
                break;
        }
    }
    finally {
        await proxyManager.releaseAll(proxies);
    }
    if (primaryError)
        throw primaryError;
    if (cleanupErrors.length === 1)
        throw cleanupErrors[0];
    if (cleanupErrors.length > 1)
        throw new AggregateError(cleanupErrors, "Browser runtime cleanup failed");
}
export function buildBrowserLaunchOptions(config, proxy, profileId) {
    return {
        visible: config.general.browserVisible,
        ...(proxy ? { proxy } : {}),
        ...(profileId ? { profileId } : {}),
        ...(config.browser.engine === "camoufox" ? { camoufox: config.browser.camoufox.options } : {})
    };
}
