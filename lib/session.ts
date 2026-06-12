import type { TimetableData } from "./parser"

function parsePeriodStart(period: string): Date | null {
  const match = period.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function getSessionRange(session: TimetableData): { start: Date; end: Date } | null {
  const periodStart = parsePeriodStart(session.period)
  const baseYear = periodStart ? periodStart.getFullYear() : new Date().getFullYear()
  const startMonth = periodStart ? periodStart.getMonth() + 1 : null

  const allDates: Date[] = []
  for (const week of session.weeks) {
    for (const day of week.days) {
      // 수업이 하나도 없는 날짜 헤더는 회차 범위에서 제외한다 (마지막 주에 빈 날짜 칸이 남는 시트 대응)
      if (!day.date || !day.slots.some((slot) => slot.title)) continue

      const [month, dayNum] = day.date.split("/").map(Number)
      // 그리드 날짜는 M/D 형식 — period 시작 월보다 앞선 월은 해를 넘긴 것으로 본다
      const year = startMonth !== null && month < startMonth ? baseYear + 1 : baseYear
      allDates.push(new Date(year, month - 1, dayNum))
    }
  }
  if (allDates.length === 0) return null

  allDates.sort((a, b) => a.getTime() - b.getTime())
  return { start: allDates[0], end: allDates[allDates.length - 1] }
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
