import assert from "node:assert/strict"
import test from "node:test"
import { KiotProxyError } from "../services/kiotproxy.js"
import { ProxyManager } from "./runtime-adapters.js"
import type { AppConfig } from "./config.js"

const proxy = (source: string) => ({ scheme: "http", host: source.split(":")[0], port: Number(source.split(":")[1]), source })

function config(): AppConfig {
    return {
        general: { parallelThreads: 1, operationDelaySeconds: 0, serviceMail: "hotmail-outlook", browserVisible: true },
        proxy: { mode: "file", filePath: "keys.txt" },
        browser: {
            engine: "chromium",
            gpmPort: 9495,
            camoufox: {
                mode: "default",
                options: { geoip: false, humanize: false, blockWebRTC: false, blockWebGL: false, blockImage: false }
            }
        }
    }
}

test("fallback proxy hiện tại khi Kiot chưa hết ttc", async () => {
    let newCalls = 0
    let currentCalls = 0
    const manager = new ProxyManager(config(), {
        readProxyFile: async () => "kiot-key-1",
        createKiotClient: () => ({
            resolve: async () => ({ proxy: proxy("9.9.9.9:9000") }),
            newProxy: async () => {
                newCalls += 1
                throw new KiotProxyError("Chưa đến thời gian đổi proxy", 40001051)
            },
            current: async () => {
                currentCalls += 1
                return { proxy: proxy("1.1.1.1:8000"), ttc: 42 }
            },
            release: async () => undefined
        })
    })

    const resolved = await manager.resolveRoundRobin(1)

    assert.equal(newCalls, 1)
    assert.equal(currentCalls, 1)
    assert.equal(resolved[0].proxy?.source, "1.1.1.1:8000")
})
