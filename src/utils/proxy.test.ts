import assert from "node:assert/strict"
import test from "node:test"
import { normalizeProxy, parseProxyFile, parseProxyLine, type ParseError } from "./proxy.js"

test("parses the four supported proxy forms", () => {
    assert.deepEqual(parseProxyLine("http:proxy.example:8080:user:pass", 1), {
        kind: "proxy", value: "http:proxy.example:8080:user:pass", line: 1
    })
    assert.deepEqual(parseProxyLine("https:secure.example:443", 2), {
        kind: "proxy", value: "https:secure.example:443", line: 2
    })
    assert.deepEqual(parseProxyLine("proxy.example:8080:user:pass", 3), {
        kind: "proxy", value: "proxy.example:8080:user:pass", line: 3
    })
    assert.deepEqual(parseProxyLine("proxy.example:8080", 4), {
        kind: "proxy", value: "proxy.example:8080", line: 4
    })
})

test("recognizes a Kiot key only when the line has no proxy delimiter", () => {
    assert.deepEqual(parseProxyLine("kiot-key-123", 7), {
        kind: "kiot-key", value: "kiot-key-123", line: 7
    })
})

test("defaults direct proxies to http", () => {
    assert.deepEqual(normalizeProxy("proxy.example:8080:user:pass"), {
        scheme: "http",
        host: "proxy.example",
        port: 8080,
        username: "user",
        password: "pass",
        source: "proxy.example:8080:user:pass"
    })
})

test("ignores blank lines and preserves source line numbers", () => {
    assert.deepEqual(parseProxyFile("\nproxy.example:8080\n\nkiot-key-123\n"), [
        { kind: "proxy", value: "proxy.example:8080", line: 2 },
        { kind: "kiot-key", value: "kiot-key-123", line: 4 }
    ])
})

test("rejects invalid ports with a line-numbered error", () => {
    const result = parseProxyLine("proxy.example:not-a-port", 12)
    assert.equal(result.kind, "error")
    const error = result as ParseError
    assert.equal(error.line, 12)
    assert.equal(error.value, "proxy.example:not-a-port")
    assert.match(error.message, /port/i)
    assert.throws(() => parseProxyFile("ok.example:8080\nbad.example:70000"), (thrown: ParseError) => {
        assert.equal(thrown.line, 2)
        return thrown.kind === "error"
    })
})

test("rejects malformed proxy token counts instead of treating them as keys", () => {
    const result = parseProxyLine("proxy.example:8080:user", 9)
    assert.equal(result.kind, "error")
    assert.equal((result as ParseError).line, 9)
})
