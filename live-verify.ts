import { loadConfig } from "./src/core/config.js"
import { startCanvaPreview } from "./src/utils/menu.js"
import { logger } from "./src/utils/logger.js"

const config = await loadConfig()
config.general.parallelThreads = 3
config.proxy = { mode: "none", filePath: "" }

logger.info("LIVE VERIFY: bắt đầu 3 browser thật với https://canva.com/")
await startCanvaPreview({
    inputInvite: async () => "https://canva.com/",
    loadConfig: async () => config,
    confirmInspection: async () => {
        logger.info("LIVE VERIFY: giữ browser mở 15 giây để kiểm tra thực tế")
        await new Promise(resolve => setTimeout(resolve, 15_000))
        logger.info("LIVE VERIFY: xác nhận kết thúc phiên kiểm tra")
    }
})
