import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "../core/config.js";
import { configureGpmBrowser } from "./settings.js";
test("GPM settings retries a failed connection then persists exactly one loaded group", async () => {
    const ports = [];
    const notices = [];
    let connectionAttempts = 0;
    const config = await configureGpmBrowser(DEFAULT_CONFIG, {
        inputPort: async () => connectionAttempts++ === 0 ? "9495" : "19995",
        selectRetry: async () => "retry",
        selectGroup: async (groups) => {
            assert.deepEqual(groups, [
                { id: "group-a", name: "Alpha" },
                { id: "group-b", name: "Beta" }
            ]);
            return "group-b";
        },
        inputProfileId: async (group) => {
            assert.deepEqual(group, { id: "group-b", name: "Beta" });
            return "  profile-42  ";
        },
        createClient: port => {
            ports.push(port);
            return {
                connect: async () => {
                    if (port === 9495)
                        throw new Error("GPM unavailable");
                },
                listGroups: async () => [
                    { id: "group-a", name: "Alpha" },
                    { id: "group-b", name: "Beta" }
                ]
            };
        },
        notifyError: message => notices.push(message)
    });
    assert.deepEqual(ports, [9495, 19995]);
    assert.deepEqual(notices, ["GPM unavailable"]);
    assert.deepEqual(config.browser, {
        ...DEFAULT_CONFIG.browser,
        engine: "gpm",
        gpmPort: 19995,
        gpmGroupId: "group-b",
        gpmGroupName: "Beta",
        gpmProfileId: "profile-42"
    });
});
test("GPM settings returns the prior configuration when group loading cannot be retried", async () => {
    const config = await configureGpmBrowser(DEFAULT_CONFIG, {
        inputPort: async () => "9495",
        selectRetry: async () => "back",
        selectGroup: async () => "unused",
        inputProfileId: async () => "unused",
        createClient: () => ({
            connect: async () => undefined,
            listGroups: async () => { throw new Error("groups unavailable"); }
        }),
        notifyError: () => undefined
    });
    assert.equal(config, DEFAULT_CONFIG);
});
test("GPM settings rejects a blank profile ID instead of saving an unlaunchable configuration", async () => {
    const notices = [];
    const config = await configureGpmBrowser(DEFAULT_CONFIG, {
        inputPort: async () => "9495",
        selectRetry: async () => "back",
        selectGroup: async () => "group-a",
        inputProfileId: async () => "   ",
        createClient: () => ({
            connect: async () => undefined,
            listGroups: async () => [{ id: "group-a", name: "Alpha" }]
        }),
        notifyError: message => notices.push(message)
    });
    assert.equal(config, DEFAULT_CONFIG);
    assert.deepEqual(notices, ["GPM Login cần một profile ID để khởi chạy"]);
});
