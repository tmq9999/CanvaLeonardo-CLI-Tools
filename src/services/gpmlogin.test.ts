import assert from "node:assert/strict"
import test from "node:test"
import * as gpm from "./gpmlogin.js"

type GpmSettings = { port: number; groupId: string; groupName: string }
type GpmLoginClient = {
    connect(): Promise<unknown>
    listGroups(): Promise<unknown>
    setGroup(settings: GpmSettings): void
    createProfile(input: Record<string, unknown>): Promise<unknown>
    updateProfile(id: string, input: Record<string, unknown>): Promise<unknown>
    deleteProfile(id: string): Promise<unknown>
    startProfile(id: string): Promise<{ cdpEndpoint?: string }>
    stopProfile(id: string): Promise<unknown>
}
type GpmLoginClientConstructor = new (port: number, fetchImpl: typeof fetch) => GpmLoginClient

function createClient(port: number, fetchImpl: typeof fetch): GpmLoginClient {
    assert.equal(typeof gpm.GpmLoginClient, "function", "GpmLoginClient must be exported")
    return new (gpm.GpmLoginClient as GpmLoginClientConstructor)(port, fetchImpl)
}

function isConnectionError(error: unknown, operation: string, status?: number): boolean {
    assert.equal(error instanceof gpm.GpmConnectionError, true)
    assert.equal((error as { operation?: unknown }).operation, operation)
    if (status !== undefined) assert.equal((error as { status?: unknown }).status, status)
    return true
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" }
    })
}

const settings: GpmSettings = { port: 19995, groupId: "group-selected", groupName: "Selected group" }

test("connect checks the configured GPM health endpoint", async () => {
    const requested: string[] = []
    const client = createClient(19995, async (input) => {
        requested.push(String(input))
        return jsonResponse({ success: true, data: { version: "3.0" } })
    })

    assert.deepEqual(await client.connect(), { version: "3.0" })
    assert.deepEqual(requested, ["http://127.0.0.1:19995/api/v3/health"])
})

test("connect throws a typed connection error when GPM cannot be reached", async () => {
    const client = createClient(19995, async () => { throw new Error("connection refused") })

    await assert.rejects(client.connect(), (error: unknown) => {
        isConnectionError(error, "connect")
        assert.equal(error instanceof Error, true)
        assert.match((error as Error).message, /connection refused/i)
        return true
    })
})

test("listGroups returns the API groups and keeps a group failure visible", async () => {
    const successfulClient = createClient(19995, async () => jsonResponse({
        success: true,
        data: [{ id: "group-one", name: "One" }, { id: "group-two", name: "Two" }]
    }))
    assert.deepEqual(await successfulClient.listGroups(), [
        { id: "group-one", name: "One" },
        { id: "group-two", name: "Two" }
    ])

    const failedClient = createClient(19995, async () => jsonResponse({ message: "Groups unavailable" }, 503))
    await assert.rejects(failedClient.listGroups(), (error: unknown) => isConnectionError(error, "listGroups", 503))
})

test("profile operations require exactly one configured group", async () => {
    const client = createClient(19995, async () => jsonResponse({ success: true, data: {} }))
    await assert.rejects(client.createProfile({ name: "Unscoped" }), gpm.GpmProfileScopeError)

    client.setGroup(settings)
    assert.throws(
        () => client.setGroup({ ...settings, groupId: "" }),
        gpm.GpmProfileScopeError
    )
})

test("profile CRUD and lifecycle requests use the selected group ID", async () => {
    const requests: Array<{ url: string; method: string; body?: unknown }> = []
    const client = createClient(19995, async (input, init) => {
        requests.push({
            url: String(input),
            method: init?.method ?? "GET",
            body: init?.body ? JSON.parse(String(init.body)) : undefined
        })
        if (String(input).endsWith("/start")) {
            return jsonResponse({ success: true, data: { id: "profile-1", wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/abc" } })
        }
        return jsonResponse({ success: true, data: { id: "profile-1", name: "Scoped profile" } })
    })
    client.setGroup(settings)

    await client.createProfile({ name: "Scoped profile", group_id: "attempted-override" })
    await client.updateProfile("profile-1", { name: "Renamed", group_id: "attempted-override" })
    await client.deleteProfile("profile-1")
    const started = await client.startProfile("profile-1")
    await client.stopProfile("profile-1")

    assert.equal(started.cdpEndpoint, "ws://127.0.0.1:9222/devtools/browser/abc")
    assert.deepEqual(requests, [
        { url: "http://127.0.0.1:19995/api/v3/profiles", method: "POST", body: { name: "Scoped profile", group_id: "group-selected" } },
        { url: "http://127.0.0.1:19995/api/v3/profiles/profile-1", method: "PUT", body: { name: "Renamed", group_id: "group-selected" } },
        { url: "http://127.0.0.1:19995/api/v3/profiles/profile-1?group_id=group-selected", method: "DELETE", body: undefined },
        { url: "http://127.0.0.1:19995/api/v3/profiles/profile-1/start", method: "POST", body: { group_id: "group-selected" } },
        { url: "http://127.0.0.1:19995/api/v3/profiles/profile-1/stop", method: "POST", body: { group_id: "group-selected" } }
    ])
})
