import { Camoufox, type LaunchOptions as CamoufoxLaunchOptions } from "camoufox-js"
import { chromium, type LaunchOptions as PlaywrightLaunchOptions } from "playwright"
import type { GpmLoginClient } from "../services/gpmlogin.js"
import type { NormalizedProxy } from "./proxy.js"

export type BrowserPage = object

export interface BrowserContext {
    newPage(): Promise<BrowserPage>
}

export interface BrowserClient {
    newContext(): Promise<BrowserContext>
    close(): Promise<void>
}

export type BrowserSession = {
    browser: BrowserClient
    context: BrowserContext
    page: BrowserPage
    cleanup: {
        adapter: "chromium" | "camoufox" | "gpm"
        profileId?: string
        cdpEndpoint?: string
    }
}

export type BrowserLaunchOptions = {
    visible: boolean
    proxy?: NormalizedProxy
    profileId?: string
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

type GpmClient = Pick<GpmLoginClient, "startProfile" | "stopProfile">
type CdpConnector = (endpoint: string) => Promise<BrowserClient>

export class GpmLoginAdapter implements BrowserAdapter {
    constructor(
        private readonly client: GpmClient,
        private readonly dependencies: { connect?: CdpConnector } = {}
    ) {}

    async launch(options: BrowserLaunchOptions): Promise<BrowserSession> {
        if (!options.profileId) throw new Error("GPM adapter requires a profileId")
        const started = await this.client.startProfile(options.profileId)
        try {
            if (!started.cdpEndpoint) throw new Error("GPM profile did not return a CDP endpoint")
            const browser = await (this.dependencies.connect
                ? this.dependencies.connect(started.cdpEndpoint)
                : chromium.connectOverCDP(started.cdpEndpoint))
            return createSession(browser, {
                adapter: "gpm",
                profileId: options.profileId,
                cdpEndpoint: started.cdpEndpoint
            })
        } catch (error) {
            try {
                await this.client.stopProfile(options.profileId)
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

        if (browserError && profileError) {
            throw new AggregateError([browserError, profileError], "GPM browser cleanup failed")
        }
        if (browserError) throw browserError
        if (profileError) throw profileError
    }
}

function playwrightProxy(proxy: NormalizedProxy): NonNullable<PlaywrightLaunchOptions["proxy"]> {
    return {
        server: `${proxy.scheme}://${proxy.host}:${proxy.port}`,
        ...(proxy.username ? { username: proxy.username } : {}),
        ...(proxy.password ? { password: proxy.password } : {})
    }
}

async function createSession(
    browser: BrowserClient,
    cleanup: BrowserSession["cleanup"]
): Promise<BrowserSession> {
    const context = await browser.newContext()
    const page = await context.newPage()
    return { browser, context, page, cleanup }
}
