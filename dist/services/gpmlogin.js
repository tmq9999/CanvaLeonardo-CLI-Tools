const API_HOST = "127.0.0.1";
export class GpmConnectionError extends Error {
    operation;
    status;
    constructor(message, operation, status) {
        super(message);
        this.operation = operation;
        this.status = status;
        this.name = "GpmConnectionError";
    }
}
export class GpmProfileScopeError extends Error {
    constructor(message) {
        super(message);
        this.name = "GpmProfileScopeError";
    }
}
export class GpmLoginClient {
    port;
    fetchImpl;
    selectedGroup;
    constructor(port, fetchImpl = fetch) {
        this.port = port;
        this.fetchImpl = fetchImpl;
    }
    setGroup(settings) {
        if (settings.port !== this.port) {
            throw new GpmProfileScopeError("GPM group settings must use this client's port");
        }
        if (!settings.groupId.trim() || !settings.groupName.trim()) {
            throw new GpmProfileScopeError("GPM settings require exactly one group ID and name");
        }
        this.selectedGroup = { ...settings };
    }
    async connect() {
        return this.requestData("/api/v1", "connect");
    }
    async listGroups() {
        const data = await this.requestData("/api/v1/groups?page=1&page_size=100", "listGroups");
        const groups = Array.isArray(data)
            ? data
            : isRecord(data) && Array.isArray(data.data)
                ? data.data
                : undefined;
        if (!groups || !groups.every(isGroup)) {
            throw new GpmConnectionError("GPM groups response has an invalid shape", "listGroups");
        }
        return groups;
    }
    async createProfile(input) {
        return this.requestProfile("/api/v1/profiles/create", "POST", input);
    }
    async updateProfile(id, input) {
        return this.requestProfile(`/api/v1/profiles/update/${encodeURIComponent(id)}`, "POST", input);
    }
    async deleteProfile(id) {
        const group = this.requireGroup();
        return this.requestData(`/api/v1/profiles/delete/${encodeURIComponent(id)}`, "profile");
    }
    async startProfile(id) {
        this.requireGroup();
        const profile = await this.requestData(`/api/v1/profiles/start/${encodeURIComponent(id)}`, "profile");
        return { profile, ...(cdpEndpointFrom(profile) ? { cdpEndpoint: cdpEndpointFrom(profile) } : {}) };
    }
    async stopProfile(id) {
        this.requireGroup();
        await this.requestData(`/api/v1/profiles/stop/${encodeURIComponent(id)}`, "profile");
        return undefined;
    }
    async requestProfile(path, method, input) {
        const group = this.requireGroup();
        const { group_id: _ignoredGroupId, ...profileInput } = input;
        const data = await this.requestData(path, "profile", {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...profileInput, group_id: group.groupId })
        });
        if (!isRecord(data))
            throw new GpmConnectionError("GPM profile response has an invalid shape", "profile");
        return data;
    }
    requireGroup() {
        if (!this.selectedGroup)
            throw new GpmProfileScopeError("Select exactly one GPM group before profile operations");
        return this.selectedGroup;
    }
    async requestData(path, operation, init) {
        let response;
        try {
            response = await this.fetchImpl(`${this.baseUrl()}${path}`, init);
        }
        catch (error) {
            throw new GpmConnectionError(error instanceof Error ? error.message : "GPM request failed", operation);
        }
        let body;
        try {
            body = await response.json();
        }
        catch {
            throw new GpmConnectionError(`GPM HTTP ${response.status} returned invalid JSON`, operation, response.status);
        }
        const envelope = isRecord(body) ? body : {};
        if (!response.ok || envelope.success === false) {
            const message = typeof envelope.message === "string" ? envelope.message : `GPM HTTP ${response.status}`;
            throw new GpmConnectionError(message, operation, response.status);
        }
        return envelope.data === undefined ? body : envelope.data;
    }
    baseUrl() {
        return `http://${API_HOST}:${this.port}`;
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function isGroup(value) {
    return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}
function cdpEndpointFrom(profile) {
    for (const key of ["websocket_debugging_url", "wsEndpoint", "ws_endpoint", "wsUrl", "ws_url", "cdpEndpoint", "cdp_endpoint"]) {
        if (typeof profile[key] === "string" && profile[key].trim())
            return profile[key];
    }
    return undefined;
}
