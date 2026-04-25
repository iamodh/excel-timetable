import { google, type sheets_v4 } from "googleapis"
import { cacheTag } from "next/cache"
import { parseSessionBlocks, type TimetableData } from "./parser"

export async function fetchTimetableData() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const sheetId = process.env.GOOGLE_SHEET_ID

  if (!keyJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.")
  }
  if (!sheetId) {
    throw new Error("GOOGLE_SHEET_ID 환경변수가 설정되지 않았습니다.")
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(keyJson),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })

  const sheets = google.sheets({ version: "v4", auth })

  const response = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    includeGridData: true,
  })

  return response.data
}

export async function getTimetableData(): Promise<TimetableData> {
  const sessions = await getAllTimetableData()
  return sessions[0]
}

export function extractFirstTabSessions(
  spreadsheet: sheets_v4.Schema$Spreadsheet,
): TimetableData[] {
  const firstTab = spreadsheet.sheets?.[0]
  if (!firstTab) return []
  const allRows = (firstTab.data?.[0]?.rowData ?? []) as Parameters<typeof parseSessionBlocks>[0]
  const allMerges = (firstTab.merges ?? []) as Parameters<typeof parseSessionBlocks>[1]

  // 매니저 시트는 첫 행 + 첫 열을 빈 패딩으로 둔다 — 파싱 전에 떼어내고 merges 인덱스도 보정한다
  const rowData = allRows.slice(1).map((row) => ({
    ...row,
    values: (row.values ?? []).slice(1),
  }))
  const merges = allMerges
    .filter((m) => m.startRowIndex >= 1 && m.startColumnIndex >= 1)
    .map((m) => ({
      ...m,
      startRowIndex: m.startRowIndex - 1,
      endRowIndex: m.endRowIndex - 1,
      startColumnIndex: m.startColumnIndex - 1,
      endColumnIndex: m.endColumnIndex - 1,
    }))

  return parseSessionBlocks(rowData, merges)
}

export async function getAllTimetableData(): Promise<TimetableData[]> {
  "use cache"
  cacheTag("timetable")
  const spreadsheet = await fetchTimetableData()
  return extractFirstTabSessions(spreadsheet)
}
