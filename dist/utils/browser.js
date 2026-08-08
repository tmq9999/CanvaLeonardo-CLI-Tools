import { Camoufox } from "camoufox-js";
import { chromium } from "playwright";
export function createBrowserAdapter() {
    return new ChromiumPlaywrightAdapter();
}
export class ChromiumPlaywrightAdapter {
    dependencies;
    constructor(dependencies = {}) {
        this.dependencies = dependencies;
    }
    async launch(options) {
        const browser = this.dependencies.launch
            ? await this.dependencies.launch({
                headless: !options.visible,
                ...(options.proxy ? { proxy: playwrightProxy(options.proxy) } : {})
            })
            : await chromium.launch({
                headless: !options.visible,
                ...(options.proxy ? { proxy: playwrightProxy(options.proxy) } : {})
            });
        return createSession(browser, { adapter: "chromium" });
    }
    async close(session) {
        await session.browser.close();
    }
}
export class CamoufoxAdapter {
    dependencies;
    constructor(dependencies = {}) {
        this.dependencies = dependencies;
    }
    async launch(options) {
        const camoufox = options.camoufox;
        const browser = await (this.dependencies.launch ?? Camoufox)({
            headless: !options.visible,
            ...(options.proxy ? { proxy: playwrightProxy(options.proxy) } : {}),
            ...(camoufox ? {
                geoip: camoufox.geoip,
                humanize: camoufox.humanize,
                block_webrtc: camoufox.blockWebRTC,
                block_webgl: camoufox.blockWebGL,
                block_images: camoufox.blockImage
            } : {})
        });
        return createSession(browser, { adapter: "camoufox" });
    }
    async close(session) {
        await session.browser.close();
    }
}
export class GpmLoginAdapter {
    client;
    dependencies;
    constructor(client, dependencies = {}) {
        this.client = client;
        this.dependencies = dependencies;
    }
    async launch(options) {
        if (!options.profileId)
            throw new Error("GPM adapter requires a profileId");
        const started = await this.client.startProfile(options.profileId);
        try {
            if (!started.cdpEndpoint)
                throw new Error("GPM profile did not return a CDP endpoint");
            const browser = await (this.dependencies.connect
                ? this.dependencies.connect(started.cdpEndpoint)
                : chromium.connectOverCDP(started.cdpEndpoint));
            return await createSession(browser, {
                adapter: "gpm",
                profileId: options.profileId,
                cdpEndpoint: started.cdpEndpoint
            });
        }
        catch (error) {
            try {
                await this.client.stopProfile(options.profileId);
            }
            catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "GPM launch cleanup failed");
            }
            throw error;
        }
    }
    async close(session) {
        let browserError;
        try {
            await session.browser.close();
        }
        catch (error) {
            browserError = error;
        }
        let profileError;
        try {
            if (session.cleanup.profileId)
                await this.client.stopProfile(session.cleanup.profileId);
        }
        catch (error) {
            profileError = error;
        }
        if (browserError && profileError) {
            throw new AggregateError([browserError, profileError], "GPM browser cleanup failed");
        }
        if (browserError)
            throw browserError;
        if (profileError)
            throw profileError;
    }
}
function playwrightProxy(proxy) {
    return {
        server: `${proxy.scheme}://${proxy.host}:${proxy.port}`,
        ...(proxy.username ? { username: proxy.username } : {}),
        ...(proxy.password ? { password: proxy.password } : {})
    };
}
async function createSession(browser, cleanup) {
    let context;
    try {
        context = await browser.newContext();
        const page = await context.newPage();
        return { browser, context, page, cleanup };
    }
    catch (error) {
        const cleanupErrors = [];
        if (context) {
            try {
                await context.close();
            }
            catch (cleanupError) {
                cleanupErrors.push(cleanupError);
            }
        }
        try {
            await browser.close();
        }
        catch (cleanupError) {
            cleanupErrors.push(cleanupError);
        }
        if (cleanupErrors.length > 0) {
            throw new AggregateError([error, ...cleanupErrors], "Browser session setup cleanup failed");
        }
        throw error;
    }
}
