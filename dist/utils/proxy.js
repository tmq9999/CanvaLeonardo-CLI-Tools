const SUPPORTED_SCHEMES = new Set(["http", "https", "socks4", "socks5", "socks5h"]);
function error(message, value, line) {
    return { kind: "error", message, value, line };
}
function splitProxy(value, line) {
    const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(value);
    if (schemeMatch) {
        const scheme = schemeMatch[1].toLowerCase();
        if (!SUPPORTED_SCHEMES.has(scheme))
            return error(`Unsupported proxy scheme: ${scheme}`, value, line);
        return { scheme, fields: schemeMatch[2].split(":") };
    }
    const fields = value.split(":");
    const firstToken = fields[0].toLowerCase();
    if (SUPPORTED_SCHEMES.has(firstToken)) {
        return { scheme: firstToken, fields: fields.slice(1) };
    }
    return { scheme: "http", fields };
}
export function parseProxyLine(line, lineNumber) {
    const value = line.trim();
    if (!value)
        return error("Proxy line cannot be blank", value, lineNumber);
    if (!value.includes(":"))
        return { kind: "kiot-key", value, line: lineNumber };
    const parsed = splitProxy(value, lineNumber);
    if ("kind" in parsed)
        return parsed;
    if (parsed.fields.length !== 2 && parsed.fields.length !== 4) {
        return error("Proxy must contain host:port or host:port:user:pass", value, lineNumber);
    }
    const [host, port] = parsed.fields;
    if (!host)
        return error("Proxy host is required", value, lineNumber);
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        return error("Proxy port must be an integer from 1 to 65535", value, lineNumber);
    }
    if (parsed.fields.length === 4 && (!parsed.fields[2] || !parsed.fields[3])) {
        return error("Proxy username and password are required together", value, lineNumber);
    }
    return { kind: "proxy", value, line: lineNumber };
}
export function parseProxyFile(content) {
    const inputs = [];
    for (const [index, line] of content.split(/\r?\n/).entries()) {
        if (!line.trim())
            continue;
        const parsed = parseProxyLine(line, index + 1);
        if (parsed.kind === "error")
            throw parsed;
        inputs.push(parsed);
    }
    return inputs;
}
export function normalizeProxy(value) {
    const parsed = parseProxyLine(value, 0);
    if (parsed.kind === "error")
        return parsed;
    if (parsed.kind === "kiot-key")
        return error("Kiot keys must be resolved before normalization", parsed.value, parsed.line);
    const split = splitProxy(parsed.value, parsed.line);
    if ("kind" in split)
        return split;
    const [host, port, username, password] = split.fields;
    return {
        scheme: split.scheme,
        host,
        port: Number(port),
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
        source: parsed.value
    };
}
