import { Camoufox, type LaunchOptions as CamoufoxLaunchOptions } from "camoufox-js"
import { chromium, type LaunchOptions as PlaywrightLaunchOptions } from "playwright"
import type { GpmLoginClient, GpmProfileStart } from "../services/gpmlogin.js"
import type { NormalizedProxy } from "./proxy.js"

export type BrowserPage = object

export interface BrowserContext {
    newPage(): Promise<BrowserPage>
    close(): Promise<void>
    pages?(): BrowserPage[]
}

export interface BrowserClient {
    newContext(): Promise<BrowserContext>
    close(): Promise<void>
    contexts?(): BrowserContext[]
}

export type BrowserSession = {
    browser: BrowserClient
    context: BrowserContext
    page: BrowserPage
    cleanup: {
        adapter: "chromium" | "camoufox" | "gpm"
        profileId?: string
        profileCreated?: boolean
        cdpEndpoint?: string
    }
}

export type BrowserLaunchOptions = {
    visible: boolean
    profileName?: string
    proxy?: NormalizedProxy
    camoufox?: {
        geoip: boolean
        humanize: boolean
        blockWebRTC: boolean
        blockWebGL: boolean
        blockImage: boolean
    }
}

export interface BrowserAdapter {
    launch(options: BrowserLaunchOptions): Promise<BrowserSession>
    close(session: BrowserSession): Promise<void>
}

export function createBrowserAdapter(): BrowserAdapter {
    return new ChromiumPlaywrightAdapter()
}

type ChromiumLaunch = (options: PlaywrightLaunchOptions) => Promise<BrowserClient>

export class ChromiumPlaywrightAdapter implements BrowserAdapter {
    constructor(private readonly dependencies: { launch?: ChromiumLaunch } = {}) {}

    async launch(options: BrowserLaunchOptions): Promise<BrowserSession> {
        const browser = this.dependencies.launch
            ? await this.dependencies.launch({
                headless: !options.visible,
                ...(options.proxy ? { proxy: playwrightProxy(options.proxy) } : {})
            })
            : await chromium.launch({
                headless: !options.visible,
                ...(options.proxy ? { proxy: playwrightProxy(options.proxy) } : {})
            })
        return createSession(browser, { adapter: "chromium" })
    }

    async close(session: BrowserSession): Promise<void> {
        await session.browser.close()
    }
}

type CamoufoxLaunch = (options: CamoufoxLaunchOptions) => Promise<BrowserClient>

export class CamoufoxAdapter implements BrowserAdapter {
    constructor(private readonly dependencies: { launch?: CamoufoxLaunch } = {}) {}

    async launch(options: BrowserLaunchOptions): Promise<BrowserSession> {
        const camoufox = options.camoufox
        const browser = await (this.dependencies.launch ?? Camoufox)({
            headless: !options.visible,
            ...(options.proxy ? { proxy: playwrightProxy(options.proxy) } : {}),
            ...(camoufox ? {
                geoip: camoufox.geoip,
                humanize: camoufox.humanize,
                block_webrtc: camoufox.blockWebRTC,
                block_webgl: camoufox.blockWebGL,
                block_images: camoufox.blockImage
            } : {})
        })
        return createSession(browser, { adapter: "camoufox" })
    }

    async close(session: BrowserSession): Promise<void> {
        await session.browser.close()
    }
}

type GpmClient = Pick<GpmLoginClient, "createProfile" | "startProfile" | "stopProfile">
type CdpConnector = (endpoint: string) => Promise<BrowserClient>

export class GpmLoginAdapter implements BrowserAdapter {
    constructor(
        private readonly client: GpmClient,
        private readonly dependencies: { connect?: CdpConnector; debuggingPort?: number; startTimeoutMs?: number } = {}
    ) {}

    async launch(options: BrowserLaunchOptions): Promise<BrowserSession> {
        const profileId = await this.createWorkerProfile(options)
        const debuggingPort = this.dependencies.debuggingPort ?? gpmDebuggingPort(profileId)
        const started = await this.startProfile(profileId, debuggingPort)
        try {
            const cdpEndpoint = started.cdpEndpoint ?? `http://127.0.0.1:${debuggingPort}`
            const browser = await (this.dependencies.connect
                ? this.dependencies.connect(cdpEndpoint)
                : chromium.connectOverCDP(cdpEndpoint))
            return await createSession(browser, {
                adapter: "gpm",
                profileId,
                profileCreated: true,
                cdpEndpoint
            }, true)
        } catch (error) {
            try {
                await this.client.stopProfile(profileId)
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "GPM launch cleanup failed")
            }
            throw error
        }
    }

    async close(session: BrowserSession): Promise<void> {
        let browserError: unknown
        try {
            await session.browser.close()
        } catch (error) {
            browserError = error
        }

        let profileError: unknown
        try {
            if (session.cleanup.profileId) await this.client.stopProfile(session.cleanup.profileId)
        } catch (error) {
            profileError = error
        }

        if (browserError && profileError) throw new AggregateError([browserError, profileError], "GPM browser cleanup failed")
        if (browserError) throw browserError
        if (profileError) throw profileError
    }

    private async createWorkerProfile(options: BrowserLaunchOptions): Promise<string> {
        const created = await this.client.createProfile({
            name: options.profileName?.trim() || "Canva Worker",
            ...(options.proxy ? { raw_proxy: proxySource(options.proxy) } : {})
        })
        const profileId = created.id
        if (!profileId) throw new Error("GPM không trả về profile ID mới")
        return profileId
    }

    private async startProfile(profileId: string, debuggingPort: number): Promise<GpmProfileStart> {
        const start = this.client.startProfile(profileId, { remoteDebuggingPort: debuggingPort })
        const timeoutMs = this.dependencies.startTimeoutMs ?? 10_000
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            return await Promise.race([
                start,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new GpmStartTimeoutError()), timeoutMs)
                })
            ])
        } catch (error) {
            if (!(error instanceof GpmStartTimeoutError)) throw error
            return { profile: { id: profileId }, cdpEndpoint: `http://127.0.0.1:${debuggingPort}` }
        } finally {
            if (timer) clearTimeout(timer)
        }
    }
}

class GpmStartTimeoutError extends Error {}

function gpmDebuggingPort(profileId: string): number {
    let hash = 0
    for (const character of profileId) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0
    return 30_000 + (hash % 20_000)
}

function playwrightProxy(proxy: NormalizedProxy): NonNullable<PlaywrightLaunchOptions["proxy"]> {
    return {
        server: `${proxy.scheme}://${proxy.host}:${proxy.port}`,
        ...(proxy.username ? { username: proxy.username } : {}),
        ...(proxy.password ? { password: proxy.password } : {})
    }
}

function proxySource(proxy: NormalizedProxy): string {
    const endpoint = `${proxy.host}:${proxy.port}`
    const credentials = proxy.username
        ? `:${proxy.username}:${proxy.password ?? ""}`
        : ""
    if (proxy.scheme === "http" || proxy.scheme === "https") return `${endpoint}${credentials}`
    return `${proxy.scheme}://${endpoint}${credentials}`
}

async function createSession(
    browser: BrowserClient,
    cleanup: BrowserSession["cleanup"],
    useExistingContext = false
): Promise<BrowserSession> {
    let context: BrowserContext | undefined
    let contextCreated = false
    try {
        context = useExistingContext ? browser.contexts?.()[0] : undefined
        if (!context) {
            context = await browser.newContext()
            contextCreated = true
        }
        const page = context.pages?.()[0] ?? await context.newPage()
        return { browser, context, page, cleanup }
    } catch (error) {
        const cleanupErrors: unknown[] = []
        if (context && contextCreated) {
            try {
                await context.close()
            } catch (cleanupError) {
                cleanupErrors.push(cleanupError)
            }
        }
        try {
            await browser.close()
        } catch (cleanupError) {
            cleanupErrors.push(cleanupError)
        }

        if (cleanupErrors.length > 0) {
            throw new AggregateError([error, ...cleanupErrors], "Browser session setup cleanup failed")
        }
        throw error
    }
}
