import assert from "node:assert/strict"
import test from "node:test"
import { GpmLoginAdapter } from "./browser.js"

test("GPM tạo profile mới khi launch không truyền profile ID và xóa sau cleanup", async () => {
    const calls: string[] = []
    const client = {
        createProfile: async (input: Record<string, unknown>) => {
            calls.push(`create:${String(input.name)}:${String(input.raw_proxy)}`)
            return { id: "new-profile-1" }
        },
        startProfile: async (id: string) => {
            calls.push(`start:${id}`)
            return { profile: { id }, cdpEndpoint: "ws://gpm/new-profile-1" }
        },
        stopProfile: async (id: string) => { calls.push(`stop:${id}`) },
        deleteProfile: async (id: string) => { calls.push(`delete:${id}`) }
    }
    const browser = {
        newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
        close: async () => undefined
    }
    const adapter = new GpmLoginAdapter(client, { connect: async () => browser })

    const session = await adapter.launch({
        visible: true,
        proxy: { scheme: "http", host: "1.2.3.4", port: 8080, source: "1.2.3.4:8080" }
    })
    await adapter.close(session)

    assert.deepEqual(calls, [
        "create:Canva Worker:http://1.2.3.4:8080",
        "start:new-profile-1",
        "stop:new-profile-1",
        "delete:new-profile-1"
    ])
})
