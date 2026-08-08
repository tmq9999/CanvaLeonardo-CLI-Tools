import { GpmLoginClient } from "./src/services/gpmlogin.js"
import { logger } from "./src/utils/logger.js"

const client = new GpmLoginClient(9495)
client.setGroup({
    port: 9495,
    groupId: "09ce8303-f32b-4efd-a428-2f71bf5a02c1",
    groupName: "CanvaLeonardo"
})
await client.connect()
const name = `Canva Worker Live Verify ${Date.now()}`
const profile = await client.createProfile({ name })
if (!profile.id) throw new Error("GPM live không trả về profile ID")
logger.success(`GPM live đã tạo profile mới: ${profile.id}`)
await client.deleteProfile(profile.id)
logger.success("GPM live đã xóa profile tạm sau verification")
