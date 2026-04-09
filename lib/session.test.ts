import { describe, it, expect, vi, afterEach } from "vitest"
import { determineCurrentSession } from "./session"
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
          isHoliday: false,
          holidayName: null,
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
