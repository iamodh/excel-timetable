import { describe, it, expect, vi, afterEach } from "vitest"
import { determineCurrentSession, filterVisibleSessions } from "./session"
import type { TimetableData } from "./parser"

function makeSession(dates: string[]): TimetableData {
  return {
    programName: "테스트",
    period: "",
    location: "",
    totalHours: "",
    categories: [],
    weeks: [
      {
        weekNumber: 1,
        days: dates.map((date) => ({
          dayOfWeek: "월",
          date,
          slots: [],
        })),
      },
    ],
  }
}

describe("determineCurrentSession", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("오늘 날짜가 포함된 회차의 인덱스를 반환한다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15)) // 2026-04-15

    const sessions = [
      makeSession(["4/7", "4/8", "4/9", "4/10", "4/13"]),
      makeSession(["4/14", "4/15", "4/16", "4/17", "4/20"]),
      makeSession(["4/21", "4/22", "4/23", "4/24", "4/27"]),
    ]

    expect(determineCurrentSession(sessions)).toBe(1)
  })

  it("수업 없는 날(주말)에도 해당 회차 범위에 포함되면 그 회차를 반환한다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 11)) // 2026-04-11 (토)

    const sessions = [
      makeSession(["4/7", "4/8", "4/9", "4/10", "4/13"]),
      makeSession(["4/14", "4/15", "4/16", "4/17", "4/20"]),
    ]

    expect(determineCurrentSession(sessions)).toBe(0)
  })

  it("교육 기간 외 접속 시 첫 번째 회차(0)를 반환한다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 25)) // 2026-12-25

    const sessions = [
      makeSession(["4/7", "4/8", "4/9", "4/10", "4/13"]),
      makeSession(["4/14", "4/15", "4/16", "4/17", "4/20"]),
    ]

    expect(determineCurrentSession(sessions)).toBe(0)
  })

  it("빈 sessions 배열이면 0을 반환한다", () => {
    expect(determineCurrentSession([])).toBe(0)
  })
})

describe("filterVisibleSessions", () => {
  function makeSessionWithPeriod(period: string, programName: string): TimetableData {
    return {
      programName,
      period,
      location: "",
      totalHours: "",
      categories: [],
      weeks: [],
    }
  }

  it("오늘 기준 period 시작일이 미래인 회차는 제외하고 과거·현재 회차만 남긴다", () => {
    const sessions = [
      makeSessionWithPeriod("2026.01.05 ~ 2026.02.08", "1회차"), // 과거
      makeSessionWithPeriod("2026.04.07 ~ 2026.05.11", "2회차"), // 시작됨 (현재)
      makeSessionWithPeriod("2026.05.12 ~ 2026.06.15", "3회차"), // 미래
    ]
    const today = new Date(2026, 3, 22) // 2026-04-22

    const visible = filterVisibleSessions(sessions, today)

    expect(visible.map((s) => s.programName)).toEqual(["1회차", "2회차"])
  })

  it("모든 회차가 미래(교육 기간 전)이면 빈 배열을 반환한다", () => {
    const sessions = [
      makeSessionWithPeriod("2026.05.12 ~ 2026.06.15", "1회차"),
      makeSessionWithPeriod("2026.06.16 ~ 2026.07.20", "2회차"),
    ]
    const today = new Date(2026, 3, 22) // 2026-04-22

    expect(filterVisibleSessions(sessions, today)).toEqual([])
  })
})
