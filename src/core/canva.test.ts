import assert from "node:assert/strict"
import test from "node:test"
import { openCanvaInvite } from "./canva.js"

test("mở đúng invite URL trên page", async () => {
    const visited: string[] = []
    const session = {
        page: {
            goto: async (url: string) => {
                visited.push(url)
                return { status: () => 200 }
            }
        }
    } as never

    await openCanvaInvite(session, "https://canva.com/")

    assert.deepEqual(visited, ["https://canva.com/"])
})

test("từ chối invite URL không phải HTTP", async () => {
    const session = {
        page: { goto: async () => { throw new Error("không được gọi") } }
    } as never

    await assert.rejects(
        openCanvaInvite(session, "file:///tmp/canva.html"),
        /Invite URL phải dùng http hoặc https/
    )
})

test("từ chối khi Canva trả về response lỗi", async () => {
    const session = {
        page: {
            goto: async () => ({ status: () => 500 })
        }
    } as never

    await assert.rejects(
        openCanvaInvite(session, "https://canva.com/"),
        /Canva trả về HTTP 500/
    )
})

test("dịch lỗi proxy bị từ chối kết nối sang tiếng Việt", async () => {
    const session = {
        page: {
            goto: async () => { throw new Error("page.goto: NS_ERROR_PROXY_CONNECTION_REFUSED") }
        }
    } as never

    await assert.rejects(
        openCanvaInvite(session, "https://canva.com/"),
        /Proxy từ chối kết nối/
    )
})
