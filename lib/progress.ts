import type { TimetableData } from "./parser"
import { getSessionClassBlocks } from "./session"

export type ProgressPhase = "before" | "ongoing" | "done"

export interface CourseProgress {
  phase: ProgressPhase
  percent: number // 이수 시간 기준 진행률 (0~100, 반올림)
  pastHours: number // 오늘까지 지난 수업 시간 (전 회차 합산)
  totalHours: number
  daysUntilStart: number // 첫 개강 전일 때 개강까지 남은 일수 (그 외 0)
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// 전 회차(전 과정)를 통틀어 이수 시간 기준 진행도를 계산한다.
export function computeOverallProgress(
  sessions: TimetableData[],
  today: Date,
): CourseProgress {
  const blocks = sessions.flatMap((session) => getSessionClassBlocks(session))
  const totalHours = blocks.reduce((sum, b) => sum + b.hours, 0)

  // 수업 블록을 하나도 못 찾으면(폴백) 개강 전으로 본다
  if (blocks.length === 0) {
    return {
      phase: "before",
      percent: 0,
      pastHours: 0,
      totalHours: 0,
      daysUntilStart: 0,
    }
  }

  const todayStart = startOfDay(today)
  const dayStarts = blocks.map((b) => startOfDay(b.date))
  const firstStart = Math.min(...dayStarts)
  const lastStart = Math.max(...dayStarts)

  let phase: ProgressPhase
  if (todayStart < firstStart) phase = "before"
  else if (todayStart > lastStart) phase = "done"
  else phase = "ongoing"

  // 수업 블록은 각자의 종료 시각이 지나야 이수로 본다(시·분 단위 비교).
  // 하루에 수업이 여럿이면, 끝난 수업만 부분 집계된다.
  const pastHours = blocks
    .filter((b) => b.end.getTime() <= today.getTime())
    .reduce((sum, b) => sum + b.hours, 0)
  const percent = Math.round((pastHours / totalHours) * 100)

  const daysUntilStart =
    phase === "before" ? Math.round((firstStart - todayStart) / DAY_MS) : 0

  return {
    phase,
    percent,
    pastHours,
    totalHours,
    daysUntilStart,
  }
}
