const API_HOST = "127.0.0.1"

export type GpmSettings = {
    port: number
    groupId: string
    groupName: string
}

export type GpmGroup = {
    id: string
    name: string
    [key: string]: unknown
}

export type GpmProfileInput = Record<string, unknown>
export type GpmProfile = Record<string, unknown> & { id?: string }

export type GpmProfileStart = {
    profile: GpmProfile
    cdpEndpoint?: string
}

export class GpmConnectionError extends Error {
    constructor(
        message: string,
        public readonly operation: "connect" | "listGroups" | "profile",
        public readonly status?: number
    ) {
        super(message)
        this.name = "GpmConnectionError"
    }
}

export class GpmProfileScopeError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "GpmProfileScopeError"
    }
}

type GpmEnvelope = {
    success?: unknown
    message?: unknown
    data?: unknown
}

export class GpmLoginClient {
    private selectedGroup?: GpmSettings

    constructor(
        private readonly port: number,
        private readonly fetchImpl: typeof fetch = fetch
    ) {}

    setGroup(settings: GpmSettings): void {
        if (settings.port !== this.port) {
            throw new GpmProfileScopeError("GPM group settings must use this client's port")
        }
        if (!settings.groupId.trim() || !settings.groupName.trim()) {
            throw new GpmProfileScopeError("GPM settings require exactly one group ID and name")
        }
        this.selectedGroup = { ...settings }
    }

    async connect(): Promise<Record<string, unknown>> {
        return this.requestData("/api/v3/health", "connect") as Promise<Record<string, unknown>>
    }

    async listGroups(): Promise<GpmGroup[]> {
        const data = await this.requestData("/api/v3/groups", "listGroups")
        const groups = Array.isArray(data)
            ? data
            : isRecord(data) && Array.isArray(data.groups)
                ? data.groups
                : undefined
        if (!groups || !groups.every(isGroup)) {
            throw new GpmConnectionError("GPM groups response has an invalid shape", "listGroups")
        }
        return groups
    }

    async createProfile(input: GpmProfileInput): Promise<GpmProfile> {
        return this.requestProfile("/api/v3/profiles", "POST", input)
    }

    async updateProfile(id: string, input: GpmProfileInput): Promise<GpmProfile> {
        return this.requestProfile(`/api/v3/profiles/${encodeURIComponent(id)}`, "PUT", input)
    }

    async deleteProfile(id: string): Promise<GpmProfile> {
        const group = this.requireGroup()
        return this.requestData(
            `/api/v3/profiles/${encodeURIComponent(id)}?${new URLSearchParams({ group_id: group.groupId })}`,
            "profile",
            { method: "DELETE" }
        ) as Promise<GpmProfile>
    }

    async startProfile(id: string): Promise<GpmProfileStart> {
        const profile = await this.requestProfile(`/api/v3/profiles/${encodeURIComponent(id)}/start`, "POST", {})
        return { profile, ...(cdpEndpointFrom(profile) ? { cdpEndpoint: cdpEndpointFrom(profile) } : {}) }
    }

    async stopProfile(id: string): Promise<GpmProfile> {
        return this.requestProfile(`/api/v3/profiles/${encodeURIComponent(id)}/stop`, "POST", {})
    }

    private async requestProfile(path: string, method: "POST" | "PUT", input: GpmProfileInput): Promise<GpmProfile> {
        const group = this.requireGroup()
        const { group_id: _ignoredGroupId, ...profileInput } = input
        const data = await this.requestData(path, "profile", {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...profileInput, group_id: group.groupId })
        })
        if (!isRecord(data)) throw new GpmConnectionError("GPM profile response has an invalid shape", "profile")
        return data
    }

    private requireGroup(): GpmSettings {
        if (!this.selectedGroup) throw new GpmProfileScopeError("Select exactly one GPM group before profile operations")
        return this.selectedGroup
    }

    private async requestData(path: string, operation: GpmConnectionError["operation"], init?: RequestInit): Promise<unknown> {
        let response: Response
        try {
            response = await this.fetchImpl(`${this.baseUrl()}${path}`, init)
        } catch (error) {
            throw new GpmConnectionError(error instanceof Error ? error.message : "GPM request failed", operation)
        }

        let body: unknown
        try {
            body = await response.json()
        } catch {
            throw new GpmConnectionError(`GPM HTTP ${response.status} returned invalid JSON`, operation, response.status)
        }
        const envelope = isRecord(body) ? body as GpmEnvelope : {}
        if (!response.ok || envelope.success === false) {
            const message = typeof envelope.message === "string" ? envelope.message : `GPM HTTP ${response.status}`
            throw new GpmConnectionError(message, operation, response.status)
        }
        return envelope.data === undefined ? body : envelope.data
    }

    private baseUrl(): string {
        return `http://${API_HOST}:${this.port}`
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function isGroup(value: unknown): value is GpmGroup {
    return isRecord(value) && typeof value.id === "string" && typeof value.name === "string"
}

function cdpEndpointFrom(profile: GpmProfile): string | undefined {
    for (const key of ["wsEndpoint", "ws_endpoint", "wsUrl", "ws_url", "cdpEndpoint", "cdp_endpoint"]) {
        if (typeof profile[key] === "string" && profile[key].trim()) return profile[key] as string
    }
    return undefined
}
