import type { TimetableData, Week } from "./parser"

function parsePeriodStart(period: string): Date | null {
  const match = period.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function periodYearContext(session: TimetableData): {
  baseYear: number
  startMonth: number | null
} {
  const periodStart = parsePeriodStart(session.period)
  return {
    baseYear: periodStart ? periodStart.getFullYear() : new Date().getFullYear(),
    startMonth: periodStart ? periodStart.getMonth() + 1 : null,
  }
}

export interface ClassDay {
  date: Date
  hours: number // 그 날 수업 시간(차시) — 제목 있는 비병합 슬롯의 rowSpan 합
}

// 주차 내 실제 수업일(제목 있는 슬롯이 있는 날)의 날짜·시간 목록.
// 그리드 날짜는 M/D 형식 — period 시작 월보다 앞선 월은 해를 넘긴 것으로 본다.
function weekClassDays(
  week: Week,
  baseYear: number,
  startMonth: number | null,
): ClassDay[] {
  const result: ClassDay[] = []
  for (const day of week.days) {
    // 수업이 하나도 없는 날짜 헤더는 제외한다 (마지막 주에 빈 날짜 칸이 남는 시트 대응)
    if (!day.date || !day.slots.some((slot) => slot.title)) continue

    const [month, dayNum] = day.date.split("/").map(Number)
    const year = startMonth !== null && month < startMonth ? baseYear + 1 : baseYear
    // 병합 연속 셀은 위 셀에 이미 rowSpan으로 합산돼 있으므로 제외한다
    const hours = day.slots.reduce(
      (sum, slot) => sum + (slot.title && !slot.isMergedContinuation ? slot.rowSpan : 0),
      0,
    )
    result.push({ date: new Date(year, month - 1, dayNum), hours })
  }
  return result
}

function weekClassDates(
  week: Week,
  baseYear: number,
  startMonth: number | null,
): Date[] {
  return weekClassDays(week, baseYear, startMonth).map((d) => d.date)
}

// 회차 전체의 수업일(날짜·시간)을 날짜 오름차순으로 반환한다.
export function getSessionClassDays(session: TimetableData): ClassDay[] {
  const { baseYear, startMonth } = periodYearContext(session)
  const days = session.weeks.flatMap((week) =>
    weekClassDays(week, baseYear, startMonth)
  )
  days.sort((a, b) => a.date.getTime() - b.date.getTime())
  return days
}

export interface NextClass {
  date: string // "M/D"
  dayOfWeek: string
  startTime: string // "HH:MM"
  title: string
}

function parseClassStart(
  date: string,
  startTime: string,
  baseYear: number,
  startMonth: number | null,
): Date {
  const [month, dayNum] = date.split("/").map(Number)
  const year = startMonth !== null && month < startMonth ? baseYear + 1 : baseYear
  const [hour, minute] = startTime.split(":").map(Number)
  return new Date(year, month - 1, dayNum, hour || 0, minute || 0)
}

// 전 회차를 통틀어 오늘(날짜 단위) 이후 가장 이른 수업을 찾는다.
// 일 단위 비교 — 시각이 지난 오늘 수업도 포함하며, 같은 날 안에서는 시작 시각이 이른 수업을 반환한다. 없으면 null.
export function findNextClass(
  sessions: TimetableData[],
  now: Date,
): NextClass | null {
  const todayStart = startOfDay(now)
  let best: { time: number; info: NextClass } | null = null

  for (const session of sessions) {
    const { baseYear, startMonth } = periodYearContext(session)
    for (const week of session.weeks) {
      for (const day of week.days) {
        if (!day.date) continue
        for (const slot of day.slots) {
          if (!slot.title || slot.isMergedContinuation) continue
          const start = parseClassStart(day.date, slot.startTime, baseYear, startMonth)
          if (startOfDay(start) < todayStart) continue
          const time = start.getTime()
          if (!best || time < best.time) {
            best = {
              time,
              info: {
                date: day.date,
                dayOfWeek: day.dayOfWeek,
                startTime: slot.startTime,
                title: slot.title,
              },
            }
          }
        }
      }
    }
  }

  return best?.info ?? null
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function getSessionRange(session: TimetableData): { start: Date; end: Date } | null {
  const { baseYear, startMonth } = periodYearContext(session)
  const allDates = session.weeks.flatMap((week) =>
    weekClassDates(week, baseYear, startMonth)
  )
  if (allDates.length === 0) return null

  allDates.sort((a, b) => a.getTime() - b.getTime())
  return { start: allDates[0], end: allDates[allDates.length - 1] }
}

// 마지막 수업일이 지난(< 오늘, 날짜 단위) 주차를 past로 분리한다.
// 마지막 수업일 당일은 지나지 않은 것으로 보아 upcoming에 남긴다.
// 입력 weeks가 주차 오름차순이므로 두 그룹 모두 오름차순을 유지한다.
export function partitionWeeksByRecency(
  session: TimetableData,
  today: Date,
): { upcoming: Week[]; past: Week[] } {
  const { baseYear, startMonth } = periodYearContext(session)
  const todayStart = startOfDay(today)
  const upcoming: Week[] = []
  const past: Week[] = []

  for (const week of session.weeks) {
    const dates = weekClassDates(week, baseYear, startMonth)
    const lastDate =
      dates.length > 0 ? Math.max(...dates.map((d) => startOfDay(d))) : null
    if (lastDate !== null && lastDate < todayStart) past.push(week)
    else upcoming.push(week)
  }

  return { upcoming, past }
}

function parsePeriodEnd(period: string): Date | null {
  const matches = [...period.matchAll(/(\d{4})\.(\d{1,2})\.(\d{1,2})/g)]
  if (matches.length === 0) return null
  const m = matches[matches.length - 1]
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

// 회차의 시작·종료일 — 그리드 수업일 기준, 없으면 period 텍스트로 폴백한다.
function sessionBounds(session: TimetableData): { start: Date; end: Date } | null {
  const range = getSessionRange(session)
  if (range) return range

  const start = parsePeriodStart(session.period)
  const end = parsePeriodEnd(session.period)
  if (start && end) return { start, end }
  if (start) return { start, end: start }
  return null
}

export interface VisibleWindow {
  sessions: TimetableData[]
  currentIndex: number // sessions 내 오늘 회차 위치 (초기 스크롤·선택 타겟)
}

// 오늘 기준 노출 범위를 정한다.
// - 오늘 회차 = 아직 종료되지 않은(마지막 수업일 >= 오늘) 첫 회차. 회차 사이 공백이면 곧 시작할 회차.
// - 지난 회차는 탭으로 남기고(스크롤 가능), 미래는 다음 회차까지만 노출한다 (그 너머는 제외).
// - currentIndex로 오늘 회차 위치를 알려 초기 스크롤·선택을 맞춘다.
// - 교육 기간 전(첫 회차 시작 전)이면 빈 창을 반환한다.
// - 모든 회차 종료 후에는 전체를 노출하고 마지막 회차를 가리킨다.
export function getVisibleWindow(sessions: TimetableData[], today: Date): VisibleWindow {
  if (sessions.length === 0) return { sessions: [], currentIndex: 0 }
  const todayStart = startOfDay(today)

  const firstBounds = sessions
    .map(sessionBounds)
    .find((b): b is { start: Date; end: Date } => b !== null)
  if (firstBounds && startOfDay(firstBounds.start) > todayStart) {
    return { sessions: [], currentIndex: 0 }
  }

  // 종료되지 않은 첫 회차를 오늘 회차로 본다. 없으면(모두 종료) 마지막 회차.
  let currentIndex = sessions.length - 1
  for (let i = 0; i < sessions.length; i++) {
    const bounds = sessionBounds(sessions[i])
    if (bounds && startOfDay(bounds.end) >= todayStart) {
      currentIndex = i
      break
    }
  }

  // 지난 회차는 유지, 미래는 다음 회차까지만 노출
  return { sessions: sessions.slice(0, currentIndex + 2), currentIndex }
}
