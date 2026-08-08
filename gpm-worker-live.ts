import { runCanvaWorkers } from "./src/core/workers.js"
import { logger } from "./src/utils/logger.js"

await runCanvaWorkers({
    general: {
        parallelThreads: 1,
        operationDelaySeconds: 0,
        serviceMail: "hotmail-outlook",
        browserVisible: true
    },
    proxy: { mode: "none", filePath: "" },
    browser: {
        engine: "gpm",
        gpmPort: 9495,
        gpmGroupId: "09ce8303-f32b-4efd-a428-2f71bf5a02c1",
        gpmGroupName: "CanvaLeonardo",
        camoufox: {
            mode: "default",
            options: { geoip: false, humanize: false, blockWebRTC: false, blockWebGL: false, blockImage: false }
        }
    }
}, "https://canva.com/", {
    confirmInspection: async () => {
        logger.info("GPM live: đã kiểm tra browser, kết thúc phiên")
    }
})
