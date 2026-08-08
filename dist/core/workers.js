import { readFile } from "node:fs/promises";
import { GpmLoginClient } from "../services/gpmlogin.js";
import { KiotProxyClient } from "../services/kiotproxy.js";
import { CamoufoxAdapter, ChromiumPlaywrightAdapter, GpmLoginAdapter } from "../utils/browser.js";
import { normalizeProxy, parseProxyFile } from "../utils/proxy.js";
export class ProxyManager {
    config;
    dependencies;
    releasedKeys = new Set();
    kiotClient;
    constructor(config, dependencies = {}) {
        this.config = config;
        this.dependencies = dependencies;
        this.kiotClient = dependencies.createKiotClient?.() ?? new KiotProxyClient();
    }
    async resolveAll() {
        if (this.config.proxy.mode === "none")
            return [{}];
        const content = this.dependencies.readProxyFile
            ? await this.dependencies.readProxyFile(this.config.proxy.filePath)
            : await readFile(this.config.proxy.filePath, "utf8");
        const inputs = parseProxyFile(content);
        const proxies = [];
        try {
            for (const input of inputs)
                proxies.push(await this.resolve(input));
            return proxies;
        }
        catch (error) {
            await this.releaseAll(proxies);
            throw error;
        }
    }
    async releaseAll(proxies) {
        for (const proxy of proxies) {
            if (!proxy.kiotKey || this.releasedKeys.has(proxy.kiotKey))
                continue;
            this.releasedKeys.add(proxy.kiotKey);
            try {
                await this.kiotClient.release(proxy.kiotKey);
            }
            catch (error) {
                reportCleanupError(this.dependencies, error);
            }
        }
    }
    async resolve(input) {
        if (input.kind === "kiot-key") {
            const resolved = await this.kiotClient.resolve(input);
            return { proxy: resolved.proxy, kiotKey: input.value };
        }
        const normalized = normalizeProxy(input.value);
        if ("kind" in normalized)
            throw new Error(normalized.message);
        return { proxy: normalized };
    }
}
export function reportCleanupError(dependencies, error) {
    try {
        dependencies.onCleanupError?.(error);
    }
    catch {
        // Cleanup reporting must not replace the task failure being preserved.
    }
}
export function createRuntimeAdapter(config, dependencies = {}) {
    if (dependencies.createAdapter)
        return dependencies.createAdapter(config);
    if (config.browser.engine === "chromium")
        return new ChromiumPlaywrightAdapter();
    if (config.browser.engine === "camoufox")
        return new CamoufoxAdapter();
    if (!config.browser.gpmGroupId || !config.browser.gpmGroupName) {
        throw new Error("GPM Login requires one configured group");
    }
    const client = new GpmLoginClient(config.browser.gpmPort);
    client.setGroup({
        port: config.browser.gpmPort,
        groupId: config.browser.gpmGroupId,
        groupName: config.browser.gpmGroupName
    });
    return new GpmLoginAdapter(client);
}
