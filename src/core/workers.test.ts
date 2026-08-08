import assert from "node:assert/strict"
import test from "node:test"
import type { AppConfig } from "./config.js"
import { runCanvaWorkers, type WorkerDependencies } from "./workers.js"

function config(overrides: Partial<AppConfig["proxy"]> = {}): AppConfig {
    return {
        general: {
            parallelThreads: 3,
            operationDelaySeconds: 0,
            serviceMail: "hotmail-outlook",
            browserVisible: true
        },
        proxy: { mode: "file", filePath: "proxy.txt", ...overrides },
        browser: {
            engine: "chromium",
            gpmPort: 9495,
            camoufox: {
                mode: "default",
                options: {
                    geoip: false,
                    humanize: false,
                    blockWebRTC: false,
                    blockWebGL: false,
                    blockImage: false
                }
            }
        }
    }
}

test("mở đủ worker và phân phối proxy theo round-robin", async () => {
    const launches: string[] = []
    const visited: string[] = []
    const closed: number[] = []
    const dependencies: WorkerDependencies = {
        readProxyFile: async () => "http://1.1.1.1:8001\nhttp://2.2.2.2:8002",
        createAdapter: () => ({
            launch: async (options) => {
                launches.push(`${options.proxy?.host}:${options.proxy?.port}`)
                const id = launches.length
                return { page: {}, browser: {}, context: {}, cleanup: { adapter: "chromium" }, id } as never
            },
            close: async (session) => { closed.push((session as never as { id: number }).id) }
        }),
        openInvite: async (_session, url) => { visited.push(url) },
        confirmInspection: async () => undefined
    }

    await runCanvaWorkers(config(), "https://canva.com/", dependencies)

    assert.deepEqual(launches, ["1.1.1.1:8001", "2.2.2.2:8002", "1.1.1.1:8001"])
    assert.deepEqual(visited, ["https://canva.com/", "https://canva.com/", "https://canva.com/"])
    assert.deepEqual(closed, [1, 2, 3])
})

test("launch lỗi vẫn đóng các browser đã mở", async () => {
    const closed: number[] = []
    let launchCount = 0
    const dependencies: WorkerDependencies = {
        readProxyFile: async () => "http://1.1.1.1:8001",
        createAdapter: () => ({
            launch: async () => {
                launchCount += 1
                if (launchCount === 2) throw new Error("browser lỗi")
                return { page: {}, browser: {}, context: {}, cleanup: { adapter: "chromium" }, id: launchCount } as never
            },
            close: async (session) => { closed.push((session as never as { id: number }).id) }
        }),
        openInvite: async () => undefined,
        confirmInspection: async () => undefined
    }

    await assert.rejects(
        runCanvaWorkers(config(), "https://canva.com/", dependencies),
        /browser lỗi/
    )
    assert.deepEqual(closed, [1, 3])
})
