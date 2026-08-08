import type { AppConfig } from "./config.js"
import { createRuntimeAdapter, ProxyManager, reportCleanupError, type RuntimeDependencies } from "./runtime-adapters.js"
import { openCanvaInvite } from "./canva.js"
import type { BrowserAdapter, BrowserSession } from "../utils/browser.js"
import { logger } from "../utils/logger.js"
import { buildBrowserLaunchOptions } from "../runtime/browser-runtime.js"

export type WorkerDependencies = RuntimeDependencies & {
    confirmInspection?(): Promise<void>
    openInvite?(session: BrowserSession, inviteUrl: string, workerIndex: number): Promise<void>
}

type OpenedWorker = {
    index: number
    session: BrowserSession
}

export async function runCanvaWorkers(
    config: AppConfig,
    inviteUrl: string,
    options: WorkerDependencies = {}
): Promise<void> {
    const proxyManager = new ProxyManager(config, options)
    const resolvedProxies = await proxyManager.resolveRoundRobin(config.general.parallelThreads)
    const adapter = createRuntimeAdapter(config, options)
    const opened: OpenedWorker[] = []
    const task = options.openInvite ?? ((session: BrowserSession, url: string) => openCanvaInvite(session, url))
    let primaryError: unknown
    const cleanupErrors: unknown[] = []

    try {
        const launches = await Promise.allSettled(resolvedProxies.map(async (resolved, index) => {
            const session = await adapter.launch(buildBrowserLaunchOptions(
                config,
                resolved.proxy
            ))
            opened.push({ index, session })
            logger.success(`Worker ${index + 1}/${config.general.parallelThreads} đã mở browser`)
            return session
        }))
        const launchErrors = launches.filter(result => result.status === "rejected")
        if (launchErrors.length > 0) {
            primaryError = launchErrors.length === 1
                ? launchErrors[0].reason
                : new AggregateError(launchErrors.map(result => result.reason), "Không thể mở đủ browser worker")
            throw primaryError
        }

        await Promise.all(opened.map(({ index, session }) => task(session, inviteUrl, index)))
        logger.info(`Đã mở ${opened.length} browser. Hãy kiểm tra browser rồi xác nhận để kết thúc phiên.`)
        await options.confirmInspection?.()
    } catch (error) {
        primaryError ??= error
    } finally {
        for (const { index, session } of opened) {
            try {
                await adapter.close(session)
                logger.info(`Đã đóng browser worker ${index + 1}`)
            } catch (error) {
                cleanupErrors.push(error)
                reportCleanupError(options, error)
            }
        }
        await proxyManager.releaseAll(resolvedProxies)
    }

    if (primaryError) throw primaryError
    if (cleanupErrors.length === 1) throw cleanupErrors[0]
    if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, "Dọn dẹp browser worker thất bại")
}
