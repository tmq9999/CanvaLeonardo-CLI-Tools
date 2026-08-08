import { readFile } from "node:fs/promises"
import type { AppConfig } from "./config.js"
import { GpmLoginClient } from "../services/gpmlogin.js"
import { KiotProxyClient } from "../services/kiotproxy.js"
import { CamoufoxAdapter, ChromiumPlaywrightAdapter, GpmLoginAdapter, type BrowserAdapter } from "../utils/browser.js"
import { normalizeProxy, parseProxyFile, type NormalizedProxy, type ProxyInput } from "../utils/proxy.js"

type KiotClient = {
    resolve(input: ProxyInput): Promise<KiotResolvedProxy>
    newProxy?(key: string, region?: string): Promise<KiotResolvedProxy>
    current?(key: string): Promise<KiotResolvedProxy>
    release(key: string): Promise<void>
}

type KiotResolvedProxy = {
    proxy: NormalizedProxy
    ttc?: number
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
        const inputs = await this.readInputs()
        const proxies: ResolvedRuntimeProxy[] = []
        try {
            for (const input of inputs) proxies.push(await this.resolve(input))
            return proxies
        } catch (error) {
            await this.releaseAll(proxies)
            throw error
        }
    }

    async resolveRoundRobin(count: number): Promise<ResolvedRuntimeProxy[]> {
        if (!Number.isInteger(count) || count < 1) throw new Error("Số worker phải là số nguyên từ 1 trở lên")
        if (this.config.proxy.mode === "none") return Array.from({ length: count }, () => ({}))

        const inputs = await this.readInputs()
        if (inputs.length === 0) throw new Error("Không có proxy hoặc Kiot key để khởi chạy worker")

        const proxies: ResolvedRuntimeProxy[] = []
        try {
            for (let index = 0; index < count; index += 1) {
                proxies.push(await this.resolveForWorker(inputs[index % inputs.length]))
            }
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

    private async resolveForWorker(input: ProxyInput): Promise<ResolvedRuntimeProxy> {
        if (input.kind !== "kiot-key") return this.resolve(input)
        if (!this.kiotClient.newProxy) return this.resolve(input)

        try {
            const resolved = await this.kiotClient.newProxy(input.value)
            return { proxy: resolved.proxy, kiotKey: input.value }
        } catch (primaryError) {
            if (!this.kiotClient.current) throw primaryError

            try {
                const current = await this.kiotClient.current(input.value)
                if (typeof current.ttc === "number" && current.ttc > 0) {
                    return { proxy: current.proxy, kiotKey: input.value }
                }
            } catch {
                // Preserve the original /new error when current cannot be read.
            }
            throw primaryError
        }
    }

    private async readInputs(): Promise<ProxyInput[]> {
        const content = this.dependencies.readProxyFile
            ? await this.dependencies.readProxyFile(this.config.proxy.filePath)
            : await readFile(this.config.proxy.filePath, "utf8")
        return parseProxyFile(content)
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
