import assert from "node:assert/strict"
import test from "node:test"
import { CamoufoxAdapter, ChromiumPlaywrightAdapter, GpmLoginAdapter, createBrowserAdapter } from "./browser.js"

test("browser adapter selection defaults to Playwright Chromium", () => {
    assert.equal(createBrowserAdapter() instanceof ChromiumPlaywrightAdapter, true)
})

test("Chromium adapter launches an isolated session with the normalized proxy", async () => {
    const page = {
        id: "page-1",
        goto: async (url: string) => `visited:${url}`,
        url: () => "https://browser.test/",
        close: async () => undefined
    }
    const context = {
        newPage: async () => page,
        close: async () => undefined
    }
    const browser = {
        newContext: async () => context,
        close: async () => undefined
    }
    let receivedOptions: unknown
    const adapter = new ChromiumPlaywrightAdapter({
        launch: async options => {
            receivedOptions = options
            return browser
        }
    })

    const session = await adapter.launch({
        visible: false,
        proxy: {
            scheme: "http",
            host: "proxy.example",
            port: 8080,
            username: "user",
            password: "pass",
            source: "proxy.example:8080:user:pass"
        }
    })

    assert.equal(session.context, context)
    assert.equal(session.page, page)
    assert.equal(await session.page.goto("https://browser.test/"), "visited:https://browser.test/")
    assert.equal(session.page.url(), "https://browser.test/")
    assert.deepEqual(receivedOptions, {
        headless: true,
        proxy: {
            server: "http://proxy.example:8080",
            username: "user",
            password: "pass"
        }
    })
})

test("Chromium adapter preserves the launcher receiver required by Playwright", async () => {
    const browser = {
        newContext: async () => ({ newPage: async () => ({}) }),
        close: async () => undefined
    }
    let receiver: unknown
    const dependencies = {
        async launch() {
            receiver = this
            return browser
        }
    }
    const adapter = new ChromiumPlaywrightAdapter(dependencies)

    await adapter.launch({ visible: false })

    assert.equal(receiver, dependencies)
})

test("Camoufox adapter maps browser settings and normalized proxy internally", async () => {
    const context = { newPage: async () => ({ id: "page-2" }) }
    const browser = { newContext: async () => context, close: async () => undefined }
    let receivedOptions: unknown
    const adapter = new CamoufoxAdapter({
        launch: async options => {
            receivedOptions = options
            return browser
        }
    })

    await adapter.launch({
        visible: true,
        proxy: { scheme: "socks5", host: "127.0.0.1", port: 1080, source: "127.0.0.1:1080" },
        camoufox: {
            geoip: true,
            humanize: true,
            blockWebRTC: true,
            blockWebGL: false,
            blockImage: true
        }
    })

    assert.deepEqual(receivedOptions, {
        headless: false,
        proxy: { server: "socks5://127.0.0.1:1080" },
        geoip: true,
        humanize: true,
        block_webrtc: true,
        block_webgl: false,
        block_images: true
    })
})

test("GPM adapter starts its profile, connects to its CDP endpoint, then stops it after the browser", async () => {
    const events: string[] = []
    const context = { newPage: async () => ({ id: "page-3" }) }
    const browser = {
        newContext: async () => context,
        close: async () => { events.push("browser-close") }
    }
    const adapter = new GpmLoginAdapter({
        startProfile: async profileId => {
            events.push(`start:${profileId}`)
            return { profile: { id: profileId }, cdpEndpoint: "ws://gpm.test/devtools/browser/1" }
        },
        stopProfile: async profileId => {
            events.push(`stop:${profileId}`)
            return { id: profileId }
        }
    }, {
        connect: async endpoint => {
            events.push(`connect:${endpoint}`)
            return browser
        }
    })

    const session = await adapter.launch({ visible: true, profileId: "profile-1" })
    await adapter.close(session)

    assert.deepEqual(events, [
        "start:profile-1",
        "connect:ws://gpm.test/devtools/browser/1",
        "browser-close",
        "stop:profile-1"
    ])
    assert.deepEqual(session.cleanup, {
        adapter: "gpm",
        profileId: "profile-1",
        cdpEndpoint: "ws://gpm.test/devtools/browser/1"
    })
})

test("GPM adapter preserves the injected CDP connector receiver", async () => {
    const browser = {
        newContext: async () => ({ newPage: async () => ({}) }),
        close: async () => undefined
    }
    let receiver: unknown
    const dependencies = {
        async connect() {
            receiver = this
            return browser
        }
    }
    const adapter = new GpmLoginAdapter({
        startProfile: async () => ({ profile: { id: "profile-4" }, cdpEndpoint: "ws://gpm.test/devtools/browser/4" }),
        stopProfile: async () => ({})
    }, dependencies)

    await adapter.launch({ visible: false, profileId: "profile-4" })

    assert.equal(receiver, dependencies)
})

test("GPM adapter preserves the browser cleanup error while surfacing a profile-stop error", async () => {
    const browserCloseError = new Error("browser close failed")
    const profileStopError = new Error("profile stop failed")
    const stopped: string[] = []
    const adapter = new GpmLoginAdapter({
        startProfile: async profileId => ({ profile: { id: profileId }, cdpEndpoint: "ws://gpm.test/devtools/browser/2" }),
        stopProfile: async profileId => {
            stopped.push(profileId)
            throw profileStopError
        }
    }, {
        connect: async () => ({
            newContext: async () => ({ newPage: async () => ({}) }),
            close: async () => { throw browserCloseError }
        })
    })

    const session = await adapter.launch({ visible: true, profileId: "profile-2" })

    await assert.rejects(adapter.close(session), (error: AggregateError) => {
        assert.equal(error instanceof AggregateError, true)
        assert.deepEqual(error.errors, [browserCloseError, profileStopError])
        return true
    })
    assert.deepEqual(stopped, ["profile-2"])
})

test("GPM adapter stops a started profile without replacing a CDP connection error", async () => {
    const connectionError = new Error("CDP connection failed")
    const stopped: string[] = []
    const adapter = new GpmLoginAdapter({
        startProfile: async profileId => ({ profile: { id: profileId }, cdpEndpoint: "ws://gpm.test/devtools/browser/3" }),
        stopProfile: async profileId => {
            stopped.push(profileId)
            return { id: profileId }
        }
    }, {
        connect: async () => { throw connectionError }
    })

    await assert.rejects(adapter.launch({ visible: false, profileId: "profile-3" }), connectionError)
    assert.deepEqual(stopped, ["profile-3"])
})
