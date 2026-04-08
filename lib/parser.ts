import { toHexColor } from "./color"

interface MergeRange {
  startRowIndex: number
  endRowIndex: number
  startColumnIndex: number
  endColumnIndex: number
}

interface MergeableSlot {
  rowSpan: number
  isMergedContinuation: boolean
}

interface CellData {
  formattedValue?: string
  effectiveFormat?: {
    backgroundColor?: { red?: number; green?: number; blue?: number }
  }
}

interface RowData {
  values?: CellData[]
}

interface Category {
  name: string
  color: string
}

interface Header {
  programName: string
  period: string
  location: string
  totalHours: string
}

export function parseCategories(rowData: RowData[]): Category[] {
  const categories: Category[] = []
  for (const row of rowData) {
    for (const cell of row.values ?? []) {
      const name = cell.formattedValue ?? ""
      if (name) {
        categories.push({
          name,
          color: toHexColor(cell.effectiveFormat?.backgroundColor),
        })
      }
    }
  }
  return categories
}

function getCellValue(rowData: RowData[], row: number, col: number): string {
  return rowData[row]?.values?.[col]?.formattedValue ?? ""
}

interface DayHeader {
  date: string
  dayOfWeek: string
}

interface WeekHeader {
  weekNumber: number
  days: DayHeader[]
}

export function parseWeekHeader(row: RowData): WeekHeader {
  const cells = row.values ?? []
  const weekLabel = cells[0]?.formattedValue ?? ""
  const weekNumber = parseInt(weekLabel.replace(/\D/g, ""), 10) || 1

  const days: DayHeader[] = []
  for (let i = 1; i < cells.length; i++) {
    const val = cells[i]?.formattedValue ?? ""
    if (!val) continue
    const match = val.match(/^(.+)\((\w+)\)$/)
    if (match) {
      days.push({ date: match[1], dayOfWeek: match[2] })
    }
  }

  return { weekNumber, days }
}

export function parseHeader(rowData: RowData[]): Header {
  const programName = getCellValue(rowData, 0, 0)
  const period = getCellValue(rowData, 0, 2)
  const rawLocation = getCellValue(rowData, 0, 4)
  const location = rawLocation.replace(/^교육장소\s*:\s*/, "")
  const totalHours = getCellValue(rowData, 1, 0)

  return { programName, period, location, totalHours }
}

interface Slot {
  startTime: string
  endTime: string
  title: string
  subtitle: string | null
  bgColor: string
  rowSpan: number
  isMergedContinuation: boolean
}

function parseTimeRange(timeLabel: string): { startTime: string; endTime: string } {
  const parts = timeLabel.split("~")
  return { startTime: parts[0] ?? "", endTime: parts[1] ?? "" }
}

export function parseGridSlots(rowData: RowData[]): Slot[][] {
  return rowData.map((row) => {
    const timeLabel = row.values?.[0]?.formattedValue ?? ""
    const { startTime, endTime } = parseTimeRange(timeLabel)
    const dayCells = row.values?.slice(1) ?? []

    return dayCells.map((cell) => {
      const lines = (cell.formattedValue ?? "").split("\n")
      const title = lines[0] ?? ""
      const subtitle = lines[1] ?? null

      return {
        startTime,
        endTime,
        title,
        subtitle,
        bgColor: toHexColor(cell.effectiveFormat?.backgroundColor),
        rowSpan: 1,
        isMergedContinuation: false,
      }
    })
  })
}

export function applyMerges(slots: MergeableSlot[][], merges: MergeRange[]): void {
  for (const merge of merges) {
    const span = merge.endRowIndex - merge.startRowIndex
    if (span > 1) {
      slots[merge.startRowIndex][merge.startColumnIndex].rowSpan = span
      for (let r = merge.startRowIndex + 1; r < merge.endRowIndex; r++) {
        slots[r][merge.startColumnIndex].isMergedContinuation = true
      }
    }
  }
}
