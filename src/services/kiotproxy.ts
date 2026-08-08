import { isIP } from "node:net"
import type { NormalizedProxy } from "../utils/proxy.js"
import type { ProxyInput } from "../utils/proxy.js"

const API_BASE_URL = "https://api.kiotproxy.com"

type KiotResponseData = Record<string, unknown> & { http?: unknown }

type KiotApiResponse = {
    success?: unknown
    code?: unknown
    message?: unknown
    data?: KiotResponseData
}

export type ResolvedKiotProxy = {
    proxy: NormalizedProxy
    code?: unknown
    message?: string
    metadata: KiotResponseData
}

export type ResolveKiotProxyOptions = {
    region?: string
}

export type KiotProxyClientOptions = {
    onCleanupError?: (error: unknown) => void
}

export class KiotProxyError extends Error {
    constructor(
        message: string,
        public readonly code?: unknown,
        public readonly metadata: KiotResponseData = {}
    ) {
        super(message)
        this.name = "KiotProxyError"
    }
}

export class KiotProxyClient {
    private readonly releasedKeys = new Set<string>()

    constructor(
        private readonly fetchImpl: typeof fetch = fetch,
        private readonly options: KiotProxyClientOptions = {}
    ) {}

    async current(key: string): Promise<ResolvedKiotProxy> {
        return this.requestProxy("/api/v1/proxies/current", key)
    }

    async newProxy(key: string, region?: string): Promise<ResolvedKiotProxy> {
        return this.requestProxy("/api/v1/proxies/new", key, region)
    }

    async resolve(input: ProxyInput, options: ResolveKiotProxyOptions = {}): Promise<ResolvedKiotProxy> {
        if (input.kind !== "kiot-key") {
            throw new KiotProxyError("Kiot resolver requires a ProxyInput with kind kiot-key")
        }
        return options.region ? this.newProxy(input.value, options.region) : this.current(input.value)
    }

    async release(key: string): Promise<void> {
        if (this.releasedKeys.has(key)) return
        this.releasedKeys.add(key)

        try {
            await this.request("/api/v1/proxies/out", key)
        } catch (error) {
            this.options.onCleanupError?.(error)
        }
    }

    private async requestProxy(path: string, key: string, region?: string): Promise<ResolvedKiotProxy> {
        const response = await this.request(path, key, region)
        const metadata = response.data ?? {}
        const http = metadata.http
        if (typeof http !== "string" || !http.trim()) {
            throw new KiotProxyError("Kiot response data.http is required", response.code, metadata)
        }

        return {
            proxy: normalizeKiotHttp(http, response.code, metadata),
            ...(response.code === undefined ? {} : { code: response.code }),
            ...(typeof response.message === "string" ? { message: response.message } : {}),
            metadata
        }
    }

    private async request(path: string, key: string, region?: string): Promise<KiotApiResponse> {
        const query = new URLSearchParams({ key })
        if (region) query.set("region", region)

        let httpResponse: Response
        try {
            httpResponse = await this.fetchImpl(`${API_BASE_URL}${path}?${query}`)
        } catch (error) {
            throw new KiotProxyError(error instanceof Error ? error.message : "Kiot request failed")
        }

        let body: unknown
        try {
            body = await httpResponse.json()
        } catch {
            throw new KiotProxyError(`Kiot HTTP ${httpResponse.status} returned invalid JSON`)
        }
        const response = isKiotApiResponse(body) ? body : {}
        const metadata = response.data ?? {}

        if (!httpResponse.ok) {
            throw new KiotProxyError(
                typeof response.message === "string" ? response.message : `Kiot HTTP ${httpResponse.status}`,
                response.code,
                metadata
            )
        }
        if (response.success !== true) {
            throw new KiotProxyError(
                typeof response.message === "string" ? response.message : "Kiot API request failed",
                response.code,
                metadata
            )
        }
        return response
    }
}

function isKiotApiResponse(value: unknown): value is KiotApiResponse {
    return typeof value === "object" && value !== null
}

function normalizeKiotHttp(http: string, code: unknown, metadata: KiotResponseData): NormalizedProxy {
    const match = /^([^:\s]+):(\d+)$/.exec(http.trim())
    if (!match) throw new KiotProxyError("Kiot data.http must use host:port", code, metadata)

    const port = Number(match[2])
    if (port < 1 || port > 65535) {
        throw new KiotProxyError("Kiot data.http port must be an integer from 1 to 65535", code, metadata)
    }
    if (!isValidProxyHost(match[1])) {
        throw new KiotProxyError("Kiot data.http host is invalid", code, metadata)
    }

    return { scheme: "http", host: match[1], port, source: http }
}

function isValidProxyHost(host: string): boolean {
    if (isIP(host) === 4) return true
    if (/^\d+(?:\.\d+){3}$/.test(host)) return false
    if (host.length > 253) return false

    return host.split(".").every((label) => (
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
    ))
}
