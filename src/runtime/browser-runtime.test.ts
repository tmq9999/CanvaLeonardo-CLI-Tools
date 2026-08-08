import assert from "node:assert/strict"
import test from "node:test"
import { buildBrowserLaunchOptions } from "./browser-runtime.js"
import { DEFAULT_CONFIG } from "../core/config.js"

test("tự bật Camoufox geoip khi browser dùng proxy", () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.browser.engine = "camoufox"
    config.browser.camoufox.options.geoip = false

    const options = buildBrowserLaunchOptions(config, {
        scheme: "http",
        host: "1.2.3.4",
        port: 8080,
        source: "1.2.3.4:8080"
    })

    assert.equal(options.camoufox?.geoip, true)
})
