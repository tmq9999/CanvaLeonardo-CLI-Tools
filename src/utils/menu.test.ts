import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_CONFIG } from "../core/config.js"
import { startCanvaPreview, startCanvaPreviewLoop } from "./menu.js"

test("start flow truyền invite URL và callback xác nhận cho worker", async () => {
    let confirmationCalled = false
    let receivedUrl = ""

    await startCanvaPreview({
        inputInvite: async () => "https://canva.com/",
        loadConfig: async () => structuredClone(DEFAULT_CONFIG),
        runWorkers: async (_config, inviteUrl, options) => {
            receivedUrl = inviteUrl
            await options.confirmInspection?.()
        },
        confirmInspection: async () => { confirmationCalled = true }
    })

    assert.equal(receivedUrl, "https://canva.com/")
    assert.equal(confirmationCalled, true)
})

test("preview loop clear console và hỏi invite link lại sau mỗi phiên", async () => {
    let clearCount = 0
    let promptCount = 0
    let continueCount = 0

    await startCanvaPreviewLoop({
        clearScreen: () => { clearCount += 1 },
        inputInvite: async () => {
            promptCount += 1
            return "https://canva.com/"
        },
        loadConfig: async () => structuredClone(DEFAULT_CONFIG),
        runWorkers: async () => undefined,
        shouldContinue: async () => {
            continueCount += 1
            return continueCount < 2
        }
    })

    assert.equal(promptCount, 2)
    assert.equal(clearCount, 2)
})

test("preview loop không nuốt tín hiệu thoát Ctrl+C", async () => {
    const exitError = new Error("người dùng dừng")
    exitError.name = "ExitPromptError"

    await assert.rejects(
        startCanvaPreviewLoop({
            clearScreen: () => undefined,
            inputInvite: async () => "https://canva.com/",
            loadConfig: async () => structuredClone(DEFAULT_CONFIG),
            runWorkers: async () => { throw exitError }
        }),
        error => error === exitError
    )
})
