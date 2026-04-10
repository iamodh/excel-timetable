import { toHexColor, toTextColor } from "./color"

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
    textFormat?: {
      foregroundColor?: { red?: number; green?: number; blue?: number }
    }
  }
}

interface RowData {
  values?: CellData[]
}

export interface Category {
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

export interface Slot {
  startTime: string
  endTime: string
  title: string
  subtitle: string | null
  bgColor: string
  textColor: string
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
        textColor: toTextColor(cell.effectiveFormat?.textFormat?.foregroundColor),
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

const GRID_START = 4
const WEEK_ROWS = 9

export interface Day {
  dayOfWeek: string
  date: string
  slots: Slot[]
}

export interface Week {
  weekNumber: number
  days: Day[]
}

export interface TimetableData {
  programName: string
  period: string
  location: string
  totalHours: string
  categories: Category[]
  weeks: Week[]
}

export function parseTimetable(rowData: RowData[], merges: MergeRange[]): TimetableData {
  const categories = parseCategories(rowData.slice(0, 2))
  const header = parseHeader(rowData.slice(2, 4))
  const gridRows = rowData.slice(GRID_START)

  const weeks: Week[] = []
  for (let i = 0; i + WEEK_ROWS <= gridRows.length; i += WEEK_ROWS) {
    const weekBlock = gridRows.slice(i, i + WEEK_ROWS)
    const weekHeader = parseWeekHeader(weekBlock[0])
    const slotRows = weekBlock.slice(1)
    const grid = parseGridSlots(slotRows)

    // 그리드 영역 병합 적용 (오프셋 보정: 전체 시트 기준 → 슬롯 기준)
    const slotStartRow = GRID_START + i + 1
    const gridMerges = merges
      .filter((m) => m.startRowIndex >= slotStartRow && m.endRowIndex <= slotStartRow + slotRows.length)
      .map((m) => ({
        ...m,
        startRowIndex: m.startRowIndex - slotStartRow,
        endRowIndex: m.endRowIndex - slotStartRow,
        startColumnIndex: m.startColumnIndex - 1,
        endColumnIndex: m.endColumnIndex - 1,
      }))
    applyMerges(grid, gridMerges)

    const days: Day[] = weekHeader.days.map((dh, colIdx) => ({
      dayOfWeek: dh.dayOfWeek,
      date: dh.date,
      slots: grid.map((row) => row[colIdx]),
    }))

    weeks.push({ weekNumber: weekHeader.weekNumber, days })
  }

  return { ...header, categories, weeks }
}
