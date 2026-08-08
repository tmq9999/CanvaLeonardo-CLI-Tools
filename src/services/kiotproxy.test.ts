import assert from "node:assert/strict"
import test from "node:test"
import { KiotProxyClient, KiotProxyError } from "./kiotproxy.js"

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" }
    })
}

test("resolves the current Kiot proxy into a normalized HTTP proxy", async () => {
    const requested: string[] = []
    const client = new KiotProxyClient(async (input) => {
        requested.push(String(input))
        return jsonResponse({
            success: true,
            code: 200,
            message: "Current proxy",
            data: { http: "proxy.kiot.test:3128", region: "VN", expires_at: "2026-08-08T00:00:00Z" }
        })
    })

    const resolved = await client.resolve("key-123")

    assert.deepEqual(resolved, {
        proxy: {
            scheme: "http",
            host: "proxy.kiot.test",
            port: 3128,
            source: "proxy.kiot.test:3128"
        },
        code: 200,
        message: "Current proxy",
        metadata: { http: "proxy.kiot.test:3128", region: "VN", expires_at: "2026-08-08T00:00:00Z" }
    })
    assert.deepEqual(requested, ["https://api.kiotproxy.com/api/v1/proxies/current?key=key-123"])
})

test("requests a new Kiot proxy with the optional region", async () => {
    const requested: string[] = []
    const client = new KiotProxyClient(async (input) => {
        requested.push(String(input))
        return jsonResponse({ success: true, code: 0, message: "Created", data: { http: "new.kiot.test:8080" } })
    })

    const resolved = await client.resolve("key-456", { region: "VN" })

    assert.equal(resolved.proxy.host, "new.kiot.test")
    assert.deepEqual(requested, ["https://api.kiotproxy.com/api/v1/proxies/new?key=key-456&region=VN"])
})

test("preserves Kiot API errors instead of treating them as successful proxies", async () => {
    const client = new KiotProxyClient(async () => jsonResponse({
        success: false,
        code: 429,
        message: "Proxy quota exhausted",
        data: { remaining: 0 }
    }))

    await assert.rejects(client.current("key-789"), (error: KiotProxyError) => {
        assert.equal(error.code, 429)
        assert.equal(error.message, "Proxy quota exhausted")
        assert.deepEqual(error.metadata, { remaining: 0 })
        return true
    })
})

test("rejects missing or invalid Kiot HTTP proxy fields", async () => {
    const responses = [
        { success: true, code: 0, message: "Missing", data: {} },
        { success: true, code: 0, message: "Invalid", data: { http: "proxy.kiot.test:not-a-port" } }
    ]
    const client = new KiotProxyClient(async () => jsonResponse(responses.shift()))

    await assert.rejects(client.current("key-missing"), /data\.http/i)
    await assert.rejects(client.current("key-invalid"), /host:port/i)
})

test("makes release idempotent and keeps release failures as secondary diagnostics", async () => {
    let requests = 0
    const diagnostics: unknown[] = []
    const client = new KiotProxyClient(async () => {
        requests += 1
        throw new Error("network unavailable")
    }, { onCleanupError: (error) => diagnostics.push(error) })

    await client.release("key-release")
    await client.release("key-release")

    assert.equal(requests, 1)
    assert.equal(diagnostics.length, 1)
    assert.match((diagnostics[0] as Error).message, /network unavailable/)
})
