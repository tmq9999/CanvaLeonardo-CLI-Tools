import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import * as XLSX from "xlsx"
import { LocalCanvaVault, type AccountSummary } from "../services/local-vault.js"
import { logger } from "../utils/logger.js"

const EXPORT_DIR = resolve("data/exports")

export interface ExportResult {
    filePath: string
    accountCount: number
    cleared: boolean
}

/**
 * Xuất toàn bộ account data từ database ra file XLSX.
 * Optionally clear database sau khi xuất.
 */
export async function exportAccountData(options: { clearAfterExport: boolean } = { clearAfterExport: false }): Promise<ExportResult> {
    const vault = new LocalCanvaVault()

    try {
        const accounts = vault.listAccounts()
        if (accounts.length === 0) {
            logger.warn("Database rỗng — không có dữ liệu để xuất")
            return { filePath: "", accountCount: 0, cleared: false }
        }

        // Build Excel rows
        const rows = accounts.map(accountToRow)

        // Create workbook
        const workbook = XLSX.utils.book_new()
        const worksheet = XLSX.utils.json_to_sheet(rows)

        // Auto-size columns
        const colWidths = Object.keys(rows[0]).map(key => ({
            wch: Math.max(key.length, ...rows.map(r => String(r[key as keyof typeof r] ?? "").length)) + 2
        }))
        worksheet["!cols"] = colWidths

        XLSX.utils.book_append_sheet(workbook, worksheet, "Accounts")

        // Write file
        mkdirSync(EXPORT_DIR, { recursive: true })
        const timestamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19)
        const fileName = `accounts_${timestamp}.xlsx`
        const filePath = resolve(EXPORT_DIR, fileName)
        XLSX.writeFile(workbook, filePath)

        logger.success(`Đã xuất ${accounts.length} tài khoản ra ${fileName}`)

        // Optionally clear database
        if (options.clearAfterExport) {
            vault.clearAllData()
            logger.info("Đã xóa toàn bộ dữ liệu trong database")
        }

        return { filePath, accountCount: accounts.length, cleared: options.clearAfterExport }
    } finally {
        vault.close()
    }
}

function accountToRow(account: AccountSummary): Record<string, string | number | boolean | null> {
    return {
        "Email": account.email,
        "Tên hiển thị": account.displayName,
        "Team": account.team,
        "Trạng thái": account.status,
        "MFA bật lúc": account.mfaEnabledAt,
        "Leonardo User ID": account.leonardoUserId,
        "Leonardo Username": account.leonardoUsername,
        "Leonardo Email": account.leonardoEmail,
        "Leonardo Plan": account.leonardoPlan,
        "Leonardo Source": account.leonardoSubscriptionSource,
        "Subscription Tokens": account.leonardoSubscriptionTokens,
        "Paid Tokens": account.leonardoPaidTokens,
        "Rollover Tokens": account.leonardoRolloverTokens,
        "API Credit": account.leonardoApiCredit,
        "Token Renewal": account.leonardoTokenRenewal,
        "Blocked": account.leonardoBlocked ? "Có" : "Không",
        "Leonardo tạo lúc": account.leonardoCreatedAt,
        "Tạo lúc": account.createdAt,
        "Cập nhật lúc": account.updatedAt
    }
}
