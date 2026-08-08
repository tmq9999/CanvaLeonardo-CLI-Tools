import assert from "node:assert/strict"
import test from "node:test"
import { KiotProxyClient } from "./kiotproxy.js"

function response(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" }
    })
}

test("giữ ttc khi lấy proxy Kiot mới", async () => {
    const client = new KiotProxyClient(async () => response({
        success: true,
        code: 200,
        data: { http: "1.2.3.4:8080", ttc: 59 }
    }))

    const result = await client.newProxy("key-1")

    assert.equal(result.proxy.source, "1.2.3.4:8080")
    assert.equal(result.ttc, 59)
})

test("giữ ttc khi lấy proxy Kiot hiện tại", async () => {
    const client = new KiotProxyClient(async () => response({
        success: true,
        code: 200,
        data: { http: "5.6.7.8:9090", ttc: 12 }
    }))

    const result = await client.current("key-1")

    assert.equal(result.ttc, 12)
})
