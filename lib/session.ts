import type { TimetableData } from "./parser"

function parseMonthDay(dateStr: string, year: number): Date {
  const [month, day] = dateStr.split("/").map(Number)
  return new Date(year, month - 1, day)
}

function getSessionRange(session: TimetableData, year: number): { start: Date; end: Date } | null {
  const allDates: Date[] = []
  for (const week of session.weeks) {
    for (const day of week.days) {
      if (day.date) {
        allDates.push(parseMonthDay(day.date, year))
      }
    }
  }
  if (allDates.length === 0) return null

  allDates.sort((a, b) => a.getTime() - b.getTime())
  return { start: allDates[0], end: allDates[allDates.length - 1] }
}

export function determineCurrentSession(sessions: TimetableData[]): number {
  const today = new Date()
  const year = today.getFullYear()
  const todayTime = today.getTime()

  for (let i = 0; i < sessions.length; i++) {
    const range = getSessionRange(sessions[i], year)
    if (!range) continue

    const startTime = range.start.setHours(0, 0, 0, 0)
    const endTime = range.end.setHours(23, 59, 59, 999)

    if (todayTime >= startTime && todayTime <= endTime) {
      return i
    }
  }

  return 0
}
