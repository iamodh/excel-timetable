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

function hasPeriodStarted(session: TimetableData, today: Date): boolean {
  const start = parsePeriodStart(session.period)
  if (!start) return true
  return start.getTime() <= today.getTime()
}

export function filterVisibleSessions(sessions: TimetableData[], today: Date): TimetableData[] {
  return sessions.filter((s, i) => {
    if (i === 0) return hasPeriodStarted(s, today)

    const prevRange = getSessionRange(sessions[i - 1])
    if (!prevRange) return hasPeriodStarted(s, today)

    const prevEnd = new Date(prevRange.end)
    prevEnd.setHours(23, 59, 59, 999)
    return today.getTime() > prevEnd.getTime()
  })
}

export function determineCurrentSession(sessions: TimetableData[]): number {
  const today = new Date()
  const todayTime = today.getTime()

  for (let i = 0; i < sessions.length; i++) {
    const range = getSessionRange(sessions[i])
    if (!range) continue

    const startTime = range.start.setHours(0, 0, 0, 0)
    const endTime = range.end.setHours(23, 59, 59, 999)

    if (todayTime >= startTime && todayTime <= endTime) {
      return i
    }
  }

  // 어느 회차 범위에도 속하지 않으면(회차 사이 공백 등) 가장 최근에 공개된 회차를 보여준다
  return Math.max(0, sessions.length - 1)
}
