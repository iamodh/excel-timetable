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
    const match = val.match(/^(.+)\(([^)]+)\)$/)
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

interface ColorMergeableSlot extends MergeableSlot {
  title: string
  bgColor: string
}

// 매니저가 세로 병합을 빠뜨리고 색만 칠한 셀을 위 셀의 연속으로 보정한다.
// 빈 텍스트 + 위 셀과 같은 배경색 두 조건을 모두 만족할 때만 병합으로 추정.
export function applyImplicitMerges(slots: ColorMergeableSlot[][]): void {
  if (slots.length === 0) return
  const cols = slots[0].length
  for (let c = 0; c < cols; c++) {
    for (let r = 1; r < slots.length; r++) {
      const cur = slots[r][c]
      if (cur.isMergedContinuation || cur.title) continue
      let topR = r - 1
      while (topR > 0 && slots[topR][c].isMergedContinuation) topR--
      const top = slots[topR][c]
      if (!top.title) continue
      if (!cur.bgColor || cur.bgColor !== top.bgColor) continue
      top.rowSpan = (r - topR) + cur.rowSpan
      cur.isMergedContinuation = true
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

const BLOCK_WIDTH = 6
const BLOCK_STRIDE = BLOCK_WIDTH + 1 // 6열 + 구분 열 1개

export function parseSessionBlocks(rowData: RowData[], merges: MergeRange[]): TimetableData[] {
  const sessions: TimetableData[] = []
  for (let b = 0; ; b++) {
    const startCol = b * BLOCK_STRIDE
    const endCol = startCol + BLOCK_WIDTH

    const programName = rowData[2]?.values?.[startCol]?.formattedValue ?? ""
    if (!programName) break

    const blockRows: RowData[] = rowData.map((row) => ({
      values: (row.values ?? []).slice(startCol, endCol),
    }))
    const blockMerges = merges
      .filter((m) => m.startColumnIndex >= startCol && m.endColumnIndex <= endCol)
      .map((m) => ({
        ...m,
        startColumnIndex: m.startColumnIndex - startCol,
        endColumnIndex: m.endColumnIndex - startCol,
      }))

    sessions.push(parseTimetable(blockRows, blockMerges))
  }
  return sessions
}

export function parseTimetable(rowData: RowData[], merges: MergeRange[]): TimetableData {
  const categories = parseCategories(rowData.slice(0, 2))
  const header = parseHeader(rowData.slice(2, 4))
  const gridRows = rowData.slice(GRID_START)

  const weeks: Week[] = []
  for (let i = 0; i + WEEK_ROWS <= gridRows.length; i += WEEK_ROWS) {
    const weekBlock = gridRows.slice(i, i + WEEK_ROWS)
    const weekLabel = weekBlock[0]?.values?.[0]?.formattedValue ?? ""
    if (!/\d+\s*주차/.test(weekLabel)) break
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
    applyImplicitMerges(grid)

    const days: Day[] = weekHeader.days.map((dh, colIdx) => ({
      dayOfWeek: dh.dayOfWeek,
      date: dh.date,
      slots: grid.map((row) => row[colIdx]),
    }))

    weeks.push({ weekNumber: weekHeader.weekNumber, days })
  }

  return { ...header, categories, weeks }
}
