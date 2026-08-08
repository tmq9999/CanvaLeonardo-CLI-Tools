import { Camoufox, type LaunchOptions as CamoufoxLaunchOptions } from "camoufox-js"
import { chromium, type LaunchOptions as PlaywrightLaunchOptions } from "playwright"
import type { GpmLoginClient } from "../services/gpmlogin.js"
import type { NormalizedProxy } from "./proxy.js"

export type BrowserPage = object

export interface BrowserContext {
    newPage(): Promise<BrowserPage>
    close(): Promise<void>
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
        profileCreated?: boolean
        cdpEndpoint?: string
    }
}

export type BrowserLaunchOptions = {
    visible: boolean
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

type GpmClient = Pick<GpmLoginClient, "createProfile" | "startProfile" | "stopProfile" | "deleteProfile">
type CdpConnector = (endpoint: string) => Promise<BrowserClient>

export class GpmLoginAdapter implements BrowserAdapter {
    constructor(
        private readonly client: GpmClient,
        private readonly dependencies: { connect?: CdpConnector } = {}
    ) {}

    async launch(options: BrowserLaunchOptions): Promise<BrowserSession> {
        const profileId = await this.createWorkerProfile(options)
        const started = await this.client.startProfile(profileId)
        try {
            if (!started.cdpEndpoint) throw new Error("GPM profile did not return a CDP endpoint")
            const browser = await (this.dependencies.connect
                ? this.dependencies.connect(started.cdpEndpoint)
                : chromium.connectOverCDP(started.cdpEndpoint))
            return await createSession(browser, {
                adapter: "gpm",
                profileId,
                profileCreated: true,
                cdpEndpoint: started.cdpEndpoint
            })
        } catch (error) {
            const cleanupErrors: unknown[] = []
            try {
                await this.client.stopProfile(profileId)
            } catch (cleanupError) {
                cleanupErrors.push(cleanupError)
            }
            try {
                await this.client.deleteProfile(profileId)
            } catch (cleanupError) {
                cleanupErrors.push(cleanupError)
            }
            if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], "GPM launch cleanup failed")
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

        const profileErrors: unknown[] = []
        try {
            if (session.cleanup.profileId) await this.client.stopProfile(session.cleanup.profileId)
        } catch (error) {
            profileErrors.push(error)
        }
        if (session.cleanup.profileCreated && session.cleanup.profileId) {
            try {
                await this.client.deleteProfile(session.cleanup.profileId)
            } catch (error) {
                profileErrors.push(error)
            }
        }

        if (browserError && profileErrors.length > 0) throw new AggregateError([browserError, ...profileErrors], "GPM browser cleanup failed")
        if (browserError) throw browserError
        if (profileErrors.length === 1) throw profileErrors[0]
        if (profileErrors.length > 1) throw new AggregateError(profileErrors, "GPM profile cleanup failed")
    }

    private async createWorkerProfile(options: BrowserLaunchOptions): Promise<string> {
        const created = await this.client.createProfile({
            name: "Canva Worker",
            ...(options.proxy ? { raw_proxy: proxySource(options.proxy) } : {})
        })
        const profileId = created.id
        if (!profileId) throw new Error("GPM không trả về profile ID mới")
        return profileId
    }
}

function playwrightProxy(proxy: NormalizedProxy): NonNullable<PlaywrightLaunchOptions["proxy"]> {
    return {
        server: `${proxy.scheme}://${proxy.host}:${proxy.port}`,
        ...(proxy.username ? { username: proxy.username } : {}),
        ...(proxy.password ? { password: proxy.password } : {})
    }
}

function proxySource(proxy: NormalizedProxy): string {
    const credentials = proxy.username
        ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? "")}@`
        : ""
    return `${proxy.scheme}://${credentials}${proxy.host}:${proxy.port}`
}

async function createSession(
    browser: BrowserClient,
    cleanup: BrowserSession["cleanup"]
): Promise<BrowserSession> {
    let context: BrowserContext | undefined
    try {
        context = await browser.newContext()
        const page = await context.newPage()
        return { browser, context, page, cleanup }
    } catch (error) {
        const cleanupErrors: unknown[] = []
        if (context) {
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
