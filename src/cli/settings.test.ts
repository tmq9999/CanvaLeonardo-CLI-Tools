import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_CONFIG } from "../core/config.js"
import { configureGpmBrowser } from "./settings.js"

test("GPM settings retries a failed connection then persists exactly one loaded group", async () => {
    const ports: number[] = []
    const notices: string[] = []
    let connectionAttempts = 0

    const config = await configureGpmBrowser(DEFAULT_CONFIG, {
        inputPort: async () => connectionAttempts++ === 0 ? "9495" : "19995",
        selectRetry: async () => "retry",
        selectGroup: async groups => {
            assert.deepEqual(groups, [
                { id: "group-a", name: "Alpha" },
                { id: "group-b", name: "Beta" }
            ])
            return "group-b"
        },
        createClient: port => {
            ports.push(port)
            return {
                connect: async () => {
                    if (port === 9495) throw new Error("GPM unavailable")
                },
                listGroups: async () => [
                    { id: "group-a", name: "Alpha" },
                    { id: "group-b", name: "Beta" }
                ]
            }
        },
        notifyError: message => notices.push(message)
    })

    assert.deepEqual(ports, [9495, 19995])
    assert.deepEqual(notices, ["GPM unavailable"])
    assert.deepEqual(config.browser, {
        ...DEFAULT_CONFIG.browser,
        engine: "gpm",
        gpmPort: 19995,
        gpmGroupId: "group-b",
        gpmGroupName: "Beta"
    })
})

test("GPM settings returns the prior configuration when group loading cannot be retried", async () => {
    const config = await configureGpmBrowser(DEFAULT_CONFIG, {
        inputPort: async () => "9495",
        selectRetry: async () => "back",
        selectGroup: async () => "unused",
        createClient: () => ({
            connect: async () => undefined,
            listGroups: async () => { throw new Error("groups unavailable") }
        }),
        notifyError: () => undefined
    })

    assert.equal(config, DEFAULT_CONFIG)
})
