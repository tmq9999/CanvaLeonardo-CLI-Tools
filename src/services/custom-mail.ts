import { faker } from "@faker-js/faker"
import type { CustomMailConfig } from "../core/config.js"

type FetchLike = (request: Request) => Promise<Response>

type WorkerZone = {
    name: string
    status: string
}

export class CustomMailWorkerClient {
    constructor(
        private readonly workerUrl: string,
        private readonly fetchImpl: FetchLike = request => fetch(request)
    ) {}

    async listActiveDomains(): Promise<string[]> {
        const response = await this.fetchImpl(new Request(new URL("/zones", this.workerUrl)))
        if (!response.ok) throw new Error(`Worker domains trả HTTP ${response.status}`)

        const payload = await response.json() as { zones?: unknown }
        if (!Array.isArray(payload.zones)) throw new Error("Worker domains trả dữ liệu không hợp lệ")

        return [...new Set(payload.zones
            .filter(isWorkerZone)
            .filter(zone => zone.status === "active" && isDomain(zone.name))
            .map(zone => zone.name.toLowerCase()))]
            .sort()
    }
}

export function createCustomMailbox(
    config: CustomMailConfig,
    random = Math.random,
    username = () => faker.internet.username()
): string {
    const domains = config.domainMode === "all-random" ? config.domains : config.selectedDomains
    if (domains.length === 0) {
        throw new Error(config.domainMode === "selected-random"
            ? "Cần chọn ít nhất một domain Custom Mail"
            : "Chưa có domain Custom Mail; hãy cập nhật từ Worker")
    }

    const domain = domains[Math.floor(random() * domains.length)]
    const localPart = username()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[._-]+|[._-]+$/g, "")
    if (!localPart) throw new Error("Faker không tạo được username email hợp lệ")

    return `${localPart}@${domain}`
}

function isWorkerZone(value: unknown): value is WorkerZone {
    return !!value
        && typeof value === "object"
        && typeof (value as { name?: unknown }).name === "string"
        && typeof (value as { status?: unknown }).status === "string"
}

function isDomain(value: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value)
}
