import assert from "node:assert/strict"
import test from "node:test"
import { configureGpmBrowser } from "./settings.js"
import { DEFAULT_CONFIG } from "../core/config.js"

test("GPM settings chỉ lưu group, không yêu cầu profile ID cố định", async () => {
    const config = await configureGpmBrowser(structuredClone(DEFAULT_CONFIG), {
        inputPort: async () => "9495",
        selectRetry: async () => "back",
        selectGroup: async () => "group-1",
        createClient: () => ({
            connect: async () => undefined,
            listGroups: async () => [{ id: "group-1", name: "Canva" }]
        }),
        notifyError: () => undefined
    })

    assert.equal(config.browser.engine, "gpm")
    assert.equal(config.browser.gpmGroupId, "group-1")
    assert.equal((config.browser as Record<string, unknown>).gpmProfileId, undefined)
})
