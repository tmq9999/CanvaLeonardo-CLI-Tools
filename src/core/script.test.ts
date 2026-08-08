import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { DEFAULT_CONFIG } from "./config.js"
import { runBrowserRuntime } from "./script.js"

test("runtime resolves file proxies before launch and runs tasks through one common adapter", async () => {
    const proxyFile = join(tmpdir(), `canvaleonardo-runtime-${Date.now()}.txt`)
    await writeFile(proxyFile, "direct.proxy.test:8080\nkiot-key-1\n", "utf8")
    const events: string[] = []
    const launched: unknown[] = []
    try {
        await runBrowserRuntime({
            ...DEFAULT_CONFIG,
            proxy: { mode: "file", filePath: proxyFile }
        }, async session => {
            events.push(`task:${(session.page as { id: string }).id}`)
        }, {
            createAdapter: () => ({
                launch: async options => {
                    launched.push(options)
                    return {
                        browser: { newContext: async () => context, close: async () => undefined },
                        context,
                        page: { id: `page-${launched.length}` },
                        cleanup: { adapter: "chromium" }
                    }
                },
                close: async session => { events.push(`close:${(session.page as { id: string }).id}`) }
            }),
            createKiotClient: () => ({
                resolve: async input => {
                    events.push(`resolve:${input.value}`)
                    return { proxy: { scheme: "http", host: "kiot.proxy.test", port: 3128, source: input.value } }
                },
                release: async key => { events.push(`release:${key}`) }
            })
        })
    } finally {
        await import("node:fs/promises").then(({ rm }) => rm(proxyFile, { force: true }))
    }

    assert.deepEqual(events, [
        "resolve:kiot-key-1",
        "task:page-1",
        "close:page-1",
        "task:page-2",
        "close:page-2",
        "release:kiot-key-1"
    ])
    assert.deepEqual(launched, [
        { visible: true, proxy: { scheme: "http", host: "direct.proxy.test", port: 8080, source: "direct.proxy.test:8080" } },
        { visible: true, proxy: { scheme: "http", host: "kiot.proxy.test", port: 3128, source: "kiot-key-1" } }
    ])
})

test("runtime reports cleanup errors without hiding the task error", async () => {
    const primaryError = new Error("task failed")
    const cleanupError = new Error("browser close failed")
    const reported: unknown[] = []
    await assert.rejects(runBrowserRuntime(DEFAULT_CONFIG, async () => {
        throw primaryError
    }, {
        createAdapter: () => ({
            launch: async () => ({
                browser: { newContext: async () => context, close: async () => undefined },
                context,
                page: {},
                cleanup: { adapter: "chromium" }
            }),
            close: async () => { throw cleanupError }
        }),
        onCleanupError: error => reported.push(error)
    }), primaryError)
    assert.deepEqual(reported, [cleanupError])
})

test("runtime releases resolved Kiot keys when adapter setup fails without hiding that failure", async () => {
    const primaryError = new Error("adapter setup failed")
    const releaseError = new Error("Kiot release failed")
    const reported: unknown[] = []

    await assert.rejects(runBrowserRuntime({
        ...DEFAULT_CONFIG,
        proxy: { mode: "kiot", filePath: "keys.txt" }
    }, async () => undefined, {
        readProxyFile: async () => "kiot-key-2\n",
        createKiotClient: () => ({
            resolve: async input => ({ proxy: { scheme: "http", host: "kiot.proxy.test", port: 3128, source: input.value } }),
            release: async () => { throw releaseError }
        }),
        createAdapter: () => { throw primaryError },
        onCleanupError: error => reported.push(error)
    }), primaryError)

    assert.deepEqual(reported, [releaseError])
})

test("runtime releases earlier Kiot keys when a later key fails to resolve", async () => {
    const resolveError = new Error("second Kiot key failed")
    const released: string[] = []

    await assert.rejects(runBrowserRuntime({
        ...DEFAULT_CONFIG,
        proxy: { mode: "kiot", filePath: "keys.txt" }
    }, async () => undefined, {
        readProxyFile: async () => "kiot-key-1\nkiot-key-2\n",
        createKiotClient: () => ({
            resolve: async input => {
                if (input.value === "kiot-key-2") throw resolveError
                return { proxy: { scheme: "http", host: "kiot.proxy.test", port: 3128, source: input.value } }
            },
            release: async key => { released.push(key) }
        })
    }), resolveError)

    assert.deepEqual(released, ["kiot-key-1"])
})

test("runtime passes the persisted GPM profile ID to adapter launch", async () => {
    const launched: unknown[] = []
    await runBrowserRuntime({
        ...DEFAULT_CONFIG,
        browser: {
            ...DEFAULT_CONFIG.browser,
            engine: "gpm",
            gpmGroupId: "group-42",
            gpmGroupName: "Production",
            gpmProfileId: "profile-42"
        }
    }, async () => undefined, {
        createAdapter: () => ({
            launch: async options => {
                launched.push(options)
                return {
                    browser: { newContext: async () => context, close: async () => undefined },
                    context,
                    page: {},
                    cleanup: { adapter: "gpm", profileId: options.profileId }
                }
            },
            close: async () => undefined
        })
    })

    assert.deepEqual(launched, [{ visible: true, profileId: "profile-42" }])
})

const context = { newPage: async () => ({}), close: async () => undefined }
