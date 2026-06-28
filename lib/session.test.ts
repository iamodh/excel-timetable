import { describe, it, expect, vi, afterEach } from "vitest"
import {
  determineCurrentSession,
  filterVisibleSessions,
  findNextClass,
  partitionWeeksByRecency,
} from "./session"
import type { TimetableData, Slot, Week } from "./parser"

function makeSlot(title: string): Slot {
  return {
    startTime: "10:00",
    endTime: "11:00",
    title,
    subtitle: null,
    bgColor: "#ffffff",
    textColor: "#000000",
    rowSpan: 1,
    isMergedContinuation: false,
    venue: null,
  }
}

function makeSession(
  dates: string[],
  period = "",
  programName = "테스트",
  emptyDates: string[] = [],
): TimetableData {
  return {
    programName,
    period,
    location: "",
    totalHours: "",
    categories: [],
    weeks: [
      {
        weekNumber: 1,
        days: dates.map((date) => ({
          dayOfWeek: "월",
          date,
          // 실제 파서는 빈 칸도 title이 빈 문자열인 슬롯으로 만든다
          slots: [makeSlot(emptyDates.includes(date) ? "" : "수업")],
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

  it("어느 회차 범위에도 속하지 않으면(회차 사이 공백, 교육 종료 후) 마지막 회차를 반환한다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 25)) // 2026-12-25

    const sessions = [
      makeSession(["4/7", "4/8", "4/9", "4/10", "4/13"]),
      makeSession(["4/14", "4/15", "4/16", "4/17", "4/20"]),
    ]

    expect(determineCurrentSession(sessions)).toBe(1)
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

  it("직전 회차의 마지막 날짜가 지나면 다음 회차가 바로 보인다", () => {
    const sessions = [
      makeSession(["6/1", "6/5", "6/10"], "2026.06.01 ~ 2026.06.10", "1회차"),
      makeSession(["6/20", "6/24", "6/30"], "2026.06.20 ~ 2026.06.30", "2회차"),
    ]
    const today = new Date(2026, 5, 11) // 1회차 종료 다음 날, 2회차 시작 전 공백 기간

    expect(filterVisibleSessions(sessions, today).map((s) => s.programName)).toEqual([
      "1회차",
      "2회차",
    ])
  })

  it("직전 회차의 마지막 날짜 당일까지는 다음 회차를 숨긴다", () => {
    const sessions = [
      makeSession(["6/1", "6/5", "6/10"], "2026.06.01 ~ 2026.06.10", "1회차"),
      makeSession(["6/20", "6/24", "6/30"], "2026.06.20 ~ 2026.06.30", "2회차"),
    ]
    const today = new Date(2026, 5, 10) // 1회차 마지막 날 당일

    expect(filterVisibleSessions(sessions, today).map((s) => s.programName)).toEqual([
      "1회차",
    ])
  })

  it("수업 없는 날짜 헤더는 범위에서 제외한다 — 마지막 수업일 다음 날부터 다음 회차가 보인다", () => {
    // 실제 시트는 회차 마지막 주에 수업 없는 날짜 헤더가 남는다 (예: 마지막 수업 6/10, 헤더는 6/15까지)
    const sessions = [
      makeSession(
        ["6/8", "6/9", "6/10", "6/11", "6/12", "6/15"],
        "2026.05.12 ~ 2026.06.15",
        "3회차",
        ["6/11", "6/12", "6/15"],
      ),
      makeSession(["6/16", "6/17"], "2026.06.16 ~ 2026.07.20", "4회차"),
    ]

    const onLastClassDay = filterVisibleSessions(sessions, new Date(2026, 5, 10)) // 6/10
    expect(onLastClassDay.map((s) => s.programName)).toEqual(["3회차"])

    const afterLastClassDay = filterVisibleSessions(sessions, new Date(2026, 5, 11)) // 6/11
    expect(afterLastClassDay.map((s) => s.programName)).toEqual(["3회차", "4회차"])
  })

  it("해를 넘기는 회차는 period 연도로 보정해 마지막 날짜를 계산한다", () => {
    // 보정 없으면 1/4, 1/5가 2026년으로 계산되어 마지막 날짜가 12/29가 되고 2회차가 미리 보인다
    const sessions = [
      makeSession(["12/28", "12/29", "1/4", "1/5"], "2026.12.28 ~ 2027.01.05", "1회차"),
      makeSession(["1/12", "1/16"], "2027.01.12 ~ 2027.01.16", "2회차"),
    ]

    const during = filterVisibleSessions(sessions, new Date(2027, 0, 4)) // 2027-01-04
    expect(during.map((s) => s.programName)).toEqual(["1회차"])

    const after = filterVisibleSessions(sessions, new Date(2027, 0, 6)) // 2027-01-06
    expect(after.map((s) => s.programName)).toEqual(["1회차", "2회차"])
  })

  it("그리드 날짜가 없는 회차는 period 시작일 기준으로 노출을 판단한다 (폴백)", () => {
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

describe("partitionWeeksByRecency", () => {
  function makeWeek(weekNumber: number, dates: string[]): Week {
    return {
      weekNumber,
      days: dates.map((date) => ({
        dayOfWeek: "월",
        date,
        slots: [makeSlot("수업")],
      })),
    }
  }

  function makeSessionWeeks(weeks: Week[], period = ""): TimetableData {
    return {
      programName: "테스트",
      period,
      location: "",
      totalHours: "",
      categories: [],
      weeks,
    }
  }

  it("마지막 수업일이 지난 주차는 past로, 안 지난 주차는 upcoming으로 분리하고 각 그룹은 주차 오름차순을 유지한다", () => {
    const session = makeSessionWeeks([
      makeWeek(1, ["6/2", "6/6"]),
      makeWeek(2, ["6/9", "6/13"]),
      makeWeek(3, ["6/16", "6/20"]),
      makeWeek(4, ["6/23", "6/27"]),
    ])
    const today = new Date(2026, 5, 15) // 2주차 마지막(6/13) 지남, 3주차(6/16~) 안 지남

    const { upcoming, past } = partitionWeeksByRecency(session, today)
    expect(upcoming.map((w) => w.weekNumber)).toEqual([3, 4])
    expect(past.map((w) => w.weekNumber)).toEqual([1, 2])
  })

  it("마지막 수업일 당일에는 해당 주차가 past로 가지 않는다", () => {
    const session = makeSessionWeeks([
      makeWeek(1, ["6/2", "6/6"]),
      makeWeek(2, ["6/9", "6/13"]),
    ])
    const today = new Date(2026, 5, 6) // 1주차 마지막 수업일(6/6) 당일

    const { upcoming, past } = partitionWeeksByRecency(session, today)
    expect(upcoming.map((w) => w.weekNumber)).toEqual([1, 2])
    expect(past).toEqual([])
  })
})

describe("findNextClass", () => {
  function makeTimedSlot(
    title: string,
    startTime: string,
    isMergedContinuation = false,
  ): Slot {
    return {
      startTime,
      endTime: "",
      title,
      subtitle: null,
      bgColor: "#ffffff",
      textColor: "#000000",
      rowSpan: 1,
      isMergedContinuation,
      venue: null,
    }
  }

  it("전 회차에서 오늘(일 단위) 이후 가장 이른 수업을 반환한다 — 지난 날짜·병합 연속 셀 제외, 시각 지난 오늘 수업은 포함", () => {
    const sessions: TimetableData[] = [
      {
        programName: "1회차",
        period: "2026.06.01 ~ 2026.07.31",
        location: "",
        totalHours: "",
        categories: [],
        weeks: [
          {
            weekNumber: 1,
            days: [
              { dayOfWeek: "일", date: "6/28", slots: [makeTimedSlot("어제수업", "10:00")] }, // 지난 날짜 → 제외
              {
                dayOfWeek: "월",
                date: "6/29",
                slots: [
                  makeTimedSlot("연속", "09:00", true), // 병합 연속 → 제외
                  makeTimedSlot("오늘오전", "10:00"), // 12:00 이전이지만 오늘이라 포함
                  makeTimedSlot("오늘오후", "14:00"),
                ],
              },
            ],
          },
        ],
      },
      {
        programName: "2회차",
        period: "2026.06.20 ~ 2026.08.31",
        location: "",
        totalHours: "",
        categories: [],
        weeks: [
          {
            weekNumber: 1,
            days: [
              { dayOfWeek: "화", date: "6/30", slots: [makeTimedSlot("내일수업", "09:00")] },
            ],
          },
        ],
      },
    ]

    // 6/29 12:00 기준 → 오늘 수업 중 시작 시각이 가장 이른 오늘오전(10:00)
    const next = findNextClass(sessions, new Date(2026, 5, 29, 12, 0))

    expect(next).toEqual({
      date: "6/29",
      dayOfWeek: "월",
      startTime: "10:00",
      title: "오늘오전",
    })
  })

  it("이후 수업이 없으면 null을 반환한다", () => {
    const sessions: TimetableData[] = [
      {
        programName: "1회차",
        period: "2026.06.01 ~ 2026.07.31",
        location: "",
        totalHours: "",
        categories: [],
        weeks: [
          {
            weekNumber: 1,
            days: [
              { dayOfWeek: "월", date: "6/29", slots: [makeTimedSlot("수업", "10:00")] },
            ],
          },
        ],
      },
    ]

    expect(findNextClass(sessions, new Date(2026, 7, 1))).toBeNull()
  })
})
