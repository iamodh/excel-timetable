import { google } from "googleapis"
import { parseTimetable, type TimetableData } from "./parser"

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

export async function getAllTimetableData(): Promise<TimetableData[]> {
  const spreadsheet = await fetchTimetableData()
  const sheetTabs = spreadsheet.sheets ?? []

  return sheetTabs.map((sheet) => {
    const rowData = (sheet.data?.[0]?.rowData ?? []) as Parameters<typeof parseTimetable>[0]
    const merges = (sheet.merges ?? []) as {
      startRowIndex: number
      endRowIndex: number
      startColumnIndex: number
      endColumnIndex: number
    }[]
    return parseTimetable(rowData, merges)
  })
}
