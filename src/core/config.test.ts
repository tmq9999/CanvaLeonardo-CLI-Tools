import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { DEFAULT_CONFIG, loadConfig, saveConfig, validateDelay, validatePort, validateThreads, validateTxtPath } from "./config.js"

test("loads defaults and persists updated config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "canvaleonardo-"))
    const path = join(dir, "config.json")
    try {
        assert.deepEqual(await loadConfig(path), DEFAULT_CONFIG)
        await saveConfig({ ...DEFAULT_CONFIG, general: { ...DEFAULT_CONFIG.general, parallelThreads: 3 } }, path)
        assert.equal((await loadConfig(path)).general.parallelThreads, 3)
    } finally { await rm(dir, { recursive: true, force: true }) }
})

test("validates settings input", () => {
    assert.equal(validateThreads("1"), true)
    assert.notEqual(validateThreads("0"), true)
    assert.equal(validateDelay("0.5"), true)
    assert.notEqual(validateDelay("-1"), true)
    assert.equal(validatePort("9495"), true)
    assert.notEqual(validatePort("65536"), true)
    assert.equal(validateTxtPath("proxies.txt"), true)
    assert.notEqual(validateTxtPath("proxies.csv"), true)
})
