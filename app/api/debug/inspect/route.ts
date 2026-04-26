import { NextResponse } from "next/server"
import { connection } from "next/server"
import { fetchTimetableData } from "@/lib/sheets"
import { parseSessionBlocks } from "@/lib/parser"

const BLOCK_STRIDE = 7
const BLOCK_WIDTH = 6

interface RawBg {
  red?: number | null
  green?: number | null
  blue?: number | null
}

interface RawCell {
  formattedValue?: string | null
  effectiveFormat?: {
    backgroundColor?: RawBg | null
  } | null
}

interface RawRow {
  values?: RawCell[] | null
}

interface RawMerge {
  startRowIndex?: number | null
  endRowIndex?: number | null
  startColumnIndex?: number | null
  endColumnIndex?: number | null
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Not found" }, { status: 404 })
  }

  await connection()
  const spreadsheet = await fetchTimetableData()
  const firstTab = spreadsheet.sheets?.[0]
  if (!firstTab) return NextResponse.json({ error: "no tab" })

  const allRows: RawRow[] = (firstTab.data?.[0]?.rowData ?? []) as RawRow[]
  const allMerges: RawMerge[] = (firstTab.merges ?? []) as RawMerge[]

  // 첫 행/첫 열 패딩 제거
  const rowData = allRows.slice(1).map((row) => ({
    ...row,
    values: (row.values ?? []).slice(1),
  }))
  const merges = allMerges
    .filter((m) => (m.startRowIndex ?? 0) >= 1 && (m.startColumnIndex ?? 0) >= 1)
    .map((m) => ({
      startRowIndex: (m.startRowIndex ?? 0) - 1,
      endRowIndex: (m.endRowIndex ?? 0) - 1,
      startColumnIndex: (m.startColumnIndex ?? 0) - 1,
      endColumnIndex: (m.endColumnIndex ?? 0) - 1,
    }))

  // 블록별 헤더 요약
  const blocks: { idx: number; startCol: number; programName: string; period: string }[] = []
  for (let b = 0; b < 10; b++) {
    const sc = b * BLOCK_STRIDE
    const name = rowData[2]?.values?.[sc]?.formattedValue ?? ""
    if (!name) break
    blocks.push({
      idx: b,
      startCol: sc,
      programName: name,
      period: rowData[2]?.values?.[sc + 2]?.formattedValue ?? "",
    })
  }

  // 5회차 = block index 4
  const blockIdx = 4
  const startCol = blockIdx * BLOCK_STRIDE
  const endCol = startCol + BLOCK_WIDTH

  // 주차 헤더 (요일/날짜)
  const w1Header = (rowData[4]?.values ?? [])
    .slice(startCol, endCol)
    .map((c) => c?.formattedValue ?? "")
  const w2Header = (rowData[13]?.values ?? [])
    .slice(startCol, endCol)
    .map((c) => c?.formattedValue ?? "")

  // 시간 슬롯 라벨
  const w1Times: { row: number; time: string }[] = []
  for (let r = 5; r <= 12; r++) {
    w1Times.push({ row: r, time: rowData[r]?.values?.[startCol]?.formattedValue ?? "" })
  }
  const w2Times: { row: number; time: string }[] = []
  for (let r = 14; r <= 21; r++) {
    w2Times.push({ row: r, time: rowData[r]?.values?.[startCol]?.formattedValue ?? "" })
  }

  const w1_1400 = w1Times.find((s) => s.time.startsWith("14:00"))?.row
  const w2_1400 = w2Times.find((s) => s.time.startsWith("14:00"))?.row

  // 7/21(화) 또는 7/28(화)이 위치한 컬럼 찾기
  const w1TueIdx = w1Header.findIndex((v) => /화/.test(v))
  const w2TueIdx = w2Header.findIndex((v) => /화/.test(v))
  const w1DayCol = w1TueIdx >= 0 ? startCol + w1TueIdx : -1
  const w2DayCol = w2TueIdx >= 0 ? startCol + w2TueIdx : -1

  const dumpCell = (r: number, c: number) => {
    const cell = rowData[r]?.values?.[c]
    const bg = cell?.effectiveFormat?.backgroundColor
    return {
      row: r,
      col: c,
      formattedValue: cell?.formattedValue ?? null,
      bg: bg
        ? {
            red: bg.red ?? null,
            green: bg.green ?? null,
            blue: bg.blue ?? null,
          }
        : null,
    }
  }

  // 14:00~17:00 영역 + 위/아래 1행씩 덤프
  const dumpRange = (centerRow: number | undefined, col: number) => {
    if (centerRow == null || col < 0) return []
    const out = []
    for (let r = centerRow - 1; r <= centerRow + 4; r++) {
      out.push(dumpCell(r, col))
    }
    return out
  }

  const w1Cells = dumpRange(w1_1400, w1DayCol)
  const w2Cells = dumpRange(w2_1400, w2DayCol)

  // 영역에 걸친 merge
  const overlapMerges = (centerRow: number | undefined, col: number) => {
    if (centerRow == null || col < 0) return []
    return merges.filter(
      (m) =>
        m.startColumnIndex <= col &&
        m.endColumnIndex > col &&
        m.startRowIndex < centerRow + 5 &&
        m.endRowIndex > centerRow - 1,
    )
  }

  const w1Merges = overlapMerges(w1_1400, w1DayCol)
  const w2Merges = overlapMerges(w2_1400, w2DayCol)

  // 파싱 결과
  const sessions = parseSessionBlocks(
    rowData as Parameters<typeof parseSessionBlocks>[0],
    merges as Parameters<typeof parseSessionBlocks>[1],
  )
  const session5 = sessions[blockIdx]

  const slotSummary = (slots: typeof session5.weeks[0]["days"][0]["slots"] | undefined) =>
    slots?.map((s, i) => ({
      idx: i,
      time: `${s.startTime}~${s.endTime}`,
      title: s.title,
      subtitle: s.subtitle,
      bgColor: s.bgColor,
      rowSpan: s.rowSpan,
      cont: s.isMergedContinuation,
    }))

  return NextResponse.json({
    blocks,
    target: {
      programName: session5?.programName,
      period: session5?.period,
      blockIdx,
      startCol,
      w1Header,
      w2Header,
      w1TueIdx,
      w2TueIdx,
      w1DayCol,
      w2DayCol,
      w1Times,
      w2Times,
      w1_1400_row: w1_1400,
      w2_1400_row: w2_1400,
    },
    week1: {
      cells: w1Cells,
      merges: w1Merges,
      parsedSlots: slotSummary(session5?.weeks[0]?.days[w1TueIdx - 1]?.slots),
    },
    week2: {
      cells: w2Cells,
      merges: w2Merges,
      parsedSlots: slotSummary(session5?.weeks[1]?.days[w2TueIdx - 1]?.slots),
    },
  })
}
