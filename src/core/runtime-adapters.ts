import { readFile } from "node:fs/promises"
import type { AppConfig } from "./config.js"
import { GpmLoginClient } from "../services/gpmlogin.js"
import { KiotProxyClient } from "../services/kiotproxy.js"
import { CamoufoxAdapter, ChromiumPlaywrightAdapter, GpmLoginAdapter, type BrowserAdapter } from "../utils/browser.js"
import { normalizeProxy, parseProxyFile, type NormalizedProxy, type ProxyInput } from "../utils/proxy.js"

type KiotClient = {
    resolve(input: ProxyInput): Promise<{ proxy: NormalizedProxy }>
    release(key: string): Promise<void>
}

export type ResolvedRuntimeProxy = { proxy?: NormalizedProxy; kiotKey?: string }

export type RuntimeDependencies = {
    readProxyFile?(path: string): Promise<string>
    createKiotClient?(): KiotClient
    createAdapter?(config: AppConfig): BrowserAdapter
    onCleanupError?(error: unknown): void
}

export class ProxyManager {
    private readonly releasedKeys = new Set<string>()
    private readonly kiotClient: KiotClient

    constructor(private readonly config: AppConfig, private readonly dependencies: RuntimeDependencies = {}) {
        this.kiotClient = dependencies.createKiotClient?.() ?? new KiotProxyClient()
    }

    async resolveAll(): Promise<ResolvedRuntimeProxy[]> {
        if (this.config.proxy.mode === "none") return [{}]
        const content = this.dependencies.readProxyFile
            ? await this.dependencies.readProxyFile(this.config.proxy.filePath)
            : await readFile(this.config.proxy.filePath, "utf8")
        const inputs = parseProxyFile(content)
        const proxies: ResolvedRuntimeProxy[] = []
        try {
            for (const input of inputs) proxies.push(await this.resolve(input))
            return proxies
        } catch (error) {
            await this.releaseAll(proxies)
            throw error
        }
    }

    async releaseAll(proxies: ResolvedRuntimeProxy[]): Promise<void> {
        for (const proxy of proxies) {
            if (!proxy.kiotKey || this.releasedKeys.has(proxy.kiotKey)) continue
            this.releasedKeys.add(proxy.kiotKey)
            try { await this.kiotClient.release(proxy.kiotKey) }
            catch (error) { reportCleanupError(this.dependencies, error) }
        }
    }

    private async resolve(input: ProxyInput): Promise<ResolvedRuntimeProxy> {
        if (input.kind === "kiot-key") {
            const resolved = await this.kiotClient.resolve(input)
            return { proxy: resolved.proxy, kiotKey: input.value }
        }
        const normalized = normalizeProxy(input.value)
        if ("kind" in normalized) throw new Error(normalized.message)
        return { proxy: normalized }
    }
}

export function reportCleanupError(dependencies: RuntimeDependencies, error: unknown): void {
    try { dependencies.onCleanupError?.(error) } catch { /* preserve primary error */ }
}

export function createRuntimeAdapter(config: AppConfig, dependencies: RuntimeDependencies = {}): BrowserAdapter {
    if (dependencies.createAdapter) return dependencies.createAdapter(config)
    if (config.browser.engine === "chromium") return new ChromiumPlaywrightAdapter()
    if (config.browser.engine === "camoufox") return new CamoufoxAdapter()
    if (!config.browser.gpmGroupId || !config.browser.gpmGroupName) throw new Error("GPM Login requires one configured group")
    const client = new GpmLoginClient(config.browser.gpmPort)
    client.setGroup({ port: config.browser.gpmPort, groupId: config.browser.gpmGroupId, groupName: config.browser.gpmGroupName })
    return new GpmLoginAdapter(client)
}
