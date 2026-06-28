import type { TimetableData } from "./parser"
import { getSessionClassDays, partitionWeeksByRecency } from "./session"

export type ProgressPhase = "before" | "ongoing" | "done"

export interface CourseProgress {
  phase: ProgressPhase
  classDay: number // 오늘까지 진행한 수업일 수
  totalClassDays: number
  percent: number // 수업일 기준 진행률 (0~100, 반올림)
  currentWeek: number // 진행 중인 주차 번호 (개강 전이면 0)
  totalWeeks: number
  pastHours: number // 오늘까지 지난 수업 시간
  totalHours: number
  daysUntilStart: number // 개강 전일 때 개강까지 남은 일수 (그 외 0)
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function computeCourseProgress(
  session: TimetableData,
  today: Date,
): CourseProgress {
  const classDays = getSessionClassDays(session)
  const totalClassDays = classDays.length
  const totalWeeks = session.weeks.length
  const totalHours = classDays.reduce((sum, d) => sum + d.hours, 0)

  // 수업일을 하나도 못 찾으면(폴백) 개강 전으로 본다
  if (totalClassDays === 0) {
    return {
      phase: "before",
      classDay: 0,
      totalClassDays: 0,
      percent: 0,
      currentWeek: 0,
      totalWeeks,
      pastHours: 0,
      totalHours: 0,
      daysUntilStart: 0,
    }
  }

  const todayStart = startOfDay(today)
  const firstStart = startOfDay(classDays[0].date)
  const lastStart = startOfDay(classDays[totalClassDays - 1].date)

  let phase: ProgressPhase
  if (todayStart < firstStart) phase = "before"
  else if (todayStart > lastStart) phase = "done"
  else phase = "ongoing"

  const occurred = classDays.filter((d) => startOfDay(d.date) <= todayStart)
  const classDay = occurred.length
  const pastHours = occurred.reduce((sum, d) => sum + d.hours, 0)
  const percent = Math.round((classDay / totalClassDays) * 100)

  const daysUntilStart =
    phase === "before" ? Math.round((firstStart - todayStart) / DAY_MS) : 0

  let currentWeek: number
  if (phase === "before") {
    currentWeek = 0
  } else if (phase === "done") {
    currentWeek = session.weeks[totalWeeks - 1]?.weekNumber ?? totalWeeks
  } else {
    const { upcoming } = partitionWeeksByRecency(session, today)
    currentWeek = upcoming[0]?.weekNumber ?? totalWeeks
  }

  return {
    phase,
    classDay,
    totalClassDays,
    percent,
    currentWeek,
    totalWeeks,
    pastHours,
    totalHours,
    daysUntilStart,
  }
}
