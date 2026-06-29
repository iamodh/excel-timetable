import { describe, it, expect } from "vitest"
import {
  getSessionClassDays,
  getVisibleWindow,
  findNextClass,
  partitionWeeksByRecency,
} from "./session"
import type { TimetableData, Slot, Week } from "./parser"

// 정상 수업은 항상 카테고리 색을 가진다 — 무색(#ffffff)은 공휴일·휴무 칸이다
function makeSlot(title: string): Slot {
  return {
    startTime: "10:00",
    endTime: "11:00",
    title,
    subtitle: null,
    bgColor: "#a6e3b6",
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

describe("getSessionClassDays", () => {
  function slot(title: string, rowSpan: number, bgColor: string): Slot {
    return {
      startTime: "13:00",
      endTime: "14:00",
      title,
      subtitle: null,
      bgColor,
      textColor: "#000000",
      rowSpan,
      isMergedContinuation: false,
      venue: null,
    }
  }

  it("무색(#ffffff·배경없음) 슬롯은 공휴일·휴무로 보아 시간 합산과 수업일에서 제외한다", () => {
    const session: TimetableData = {
      programName: "1회차",
      period: "2026.05.01 ~ 2026.05.31",
      location: "",
      totalHours: "",
      categories: [],
      weeks: [
        {
          weekNumber: 1,
          days: [
            // 색 있는 수업 2h + 무색 휴무 8h 같은 날 → 색 있는 2h만 집계
            {
              dayOfWeek: "수",
              date: "5/6",
              slots: [slot("수업", 2, "#a6e3b6"), slot("근로자의 날 휴무", 8, "#ffffff")],
            },
            // 무색 공휴일만 있는 날 → 수업일에서 제외
            { dayOfWeek: "화", date: "5/5", slots: [slot("어린이날", 8, "#ffffff")] },
            // 색 있는 수업만 → 그대로
            { dayOfWeek: "목", date: "5/7", slots: [slot("수업", 4, "#ffc000")] },
          ],
        },
      ],
    }

    const days = getSessionClassDays(session).map((d) => [
      `${d.date.getMonth() + 1}/${d.date.getDate()}`,
      d.hours,
    ])
    expect(days).toEqual([
      ["5/6", 2],
      ["5/7", 4],
    ])
  })
})

describe("getVisibleWindow", () => {
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

  it("지난 회차는 탭으로 남기고, 미래는 다음 회차까지만 노출하며, currentIndex가 오늘 회차를 가리킨다", () => {
    const sessions = [
      makeSession(["4/7", "4/13"], "2026.04.07 ~ 2026.04.13", "1회차"), // 지난 회차 → 탭 유지
      makeSession(["4/14", "4/20"], "2026.04.14 ~ 2026.04.20", "2회차"), // 오늘
      makeSession(["4/21", "4/27"], "2026.04.21 ~ 2026.04.27", "3회차"), // 다음 → 노출
      makeSession(["4/28", "5/4"], "2026.04.28 ~ 2026.05.04", "4회차"), // 그 너머 → 제외
    ]
    const today = new Date(2026, 3, 15) // 2회차 진행 중

    const { sessions: visible, currentIndex } = getVisibleWindow(sessions, today)
    expect(visible.map((s) => s.programName)).toEqual(["1회차", "2회차", "3회차"])
    expect(currentIndex).toBe(1)
  })

  it("회차 사이 공백에는 다가오는 회차를 오늘 회차로 가리키고, 지난 회차도 탭으로 남긴다", () => {
    const sessions = [
      makeSession(["6/1", "6/5", "6/10"], "2026.06.01 ~ 2026.06.10", "1회차"),
      makeSession(["6/20", "6/24", "6/30"], "2026.06.20 ~ 2026.06.30", "2회차"),
      makeSession(["7/6", "7/10"], "2026.07.06 ~ 2026.07.10", "3회차"),
    ]
    const today = new Date(2026, 5, 11) // 1회차 종료, 2회차 시작 전 공백

    const { sessions: visible, currentIndex } = getVisibleWindow(sessions, today)
    expect(visible.map((s) => s.programName)).toEqual(["1회차", "2회차", "3회차"])
    expect(currentIndex).toBe(1)
  })

  it("마지막 회차가 오늘 회차이면 다음 회차 없이 전체 탭을 노출하고 마지막을 가리킨다", () => {
    const sessions = [
      makeSession(["4/7", "4/13"], "2026.04.07 ~ 2026.04.13", "1회차"),
      makeSession(["4/14", "4/20"], "2026.04.14 ~ 2026.04.20", "2회차"),
    ]
    const today = new Date(2026, 3, 16) // 2회차 진행 중

    const { sessions: visible, currentIndex } = getVisibleWindow(sessions, today)
    expect(visible.map((s) => s.programName)).toEqual(["1회차", "2회차"])
    expect(currentIndex).toBe(1)
  })

  it("모든 회차가 종료된 뒤에는 전체 탭을 노출하고 마지막 회차를 가리킨다", () => {
    const sessions = [
      makeSession(["4/7", "4/13"], "2026.04.07 ~ 2026.04.13", "1회차"),
      makeSession(["4/14", "4/20"], "2026.04.14 ~ 2026.04.20", "2회차"),
    ]
    const today = new Date(2026, 11, 25) // 교육 종료 후

    const { sessions: visible, currentIndex } = getVisibleWindow(sessions, today)
    expect(visible.map((s) => s.programName)).toEqual(["1회차", "2회차"])
    expect(currentIndex).toBe(1)
  })

  it("수업 없는 날짜 헤더는 회차 종료 판단에서 제외한다 — 마지막 수업일 다음 날부터 오늘 회차가 넘어가고 지난 회차는 남는다", () => {
    // 실제 시트는 회차 마지막 주에 수업 없는 날짜 헤더가 남는다 (예: 마지막 수업 6/10, 헤더는 6/15까지)
    const sessions = [
      makeSession(
        ["6/8", "6/9", "6/10", "6/11", "6/12", "6/15"],
        "2026.05.12 ~ 2026.06.15",
        "3회차",
        ["6/11", "6/12", "6/15"],
      ),
      makeSession(["6/16", "6/17"], "2026.06.16 ~ 2026.07.20", "4회차"),
      makeSession(["7/21", "7/22"], "2026.07.21 ~ 2026.07.25", "5회차"),
    ]

    const onLastClassDay = getVisibleWindow(sessions, new Date(2026, 5, 10)) // 6/10
    expect(onLastClassDay.sessions.map((s) => s.programName)).toEqual(["3회차", "4회차"])
    expect(onLastClassDay.currentIndex).toBe(0)

    const afterLastClassDay = getVisibleWindow(sessions, new Date(2026, 5, 11)) // 6/11
    expect(afterLastClassDay.sessions.map((s) => s.programName)).toEqual([
      "3회차",
      "4회차",
      "5회차",
    ])
    expect(afterLastClassDay.currentIndex).toBe(1)
  })

  it("해를 넘기는 회차는 period 연도로 보정해 종료 여부를 판단한다", () => {
    const sessions = [
      makeSession(["12/28", "12/29", "1/4", "1/5"], "2026.12.28 ~ 2027.01.05", "1회차"),
      makeSession(["1/12", "1/16"], "2027.01.12 ~ 2027.01.16", "2회차"),
    ]

    const during = getVisibleWindow(sessions, new Date(2027, 0, 4)) // 2027-01-04
    expect(during.sessions.map((s) => s.programName)).toEqual(["1회차", "2회차"])
    expect(during.currentIndex).toBe(0)

    const after = getVisibleWindow(sessions, new Date(2027, 0, 6)) // 2027-01-06
    expect(after.sessions.map((s) => s.programName)).toEqual(["1회차", "2회차"])
    expect(after.currentIndex).toBe(1)
  })

  it("그리드 날짜가 없는 회차는 period 기준으로 종료 여부를 판단한다 (폴백)", () => {
    const sessions = [
      makeSessionWithPeriod("2026.01.05 ~ 2026.02.08", "1회차"), // 과거 → 탭 유지
      makeSessionWithPeriod("2026.04.07 ~ 2026.05.11", "2회차"), // 진행 중
      makeSessionWithPeriod("2026.05.12 ~ 2026.06.15", "3회차"), // 다음
    ]
    const today = new Date(2026, 3, 22) // 2026-04-22

    const { sessions: visible, currentIndex } = getVisibleWindow(sessions, today)
    expect(visible.map((s) => s.programName)).toEqual(["1회차", "2회차", "3회차"])
    expect(currentIndex).toBe(1)
  })

  it("모든 회차가 미래(교육 기간 전)이면 빈 창을 반환한다", () => {
    const sessions = [
      makeSessionWithPeriod("2026.05.12 ~ 2026.06.15", "1회차"),
      makeSessionWithPeriod("2026.06.16 ~ 2026.07.20", "2회차"),
    ]
    const today = new Date(2026, 3, 22) // 2026-04-22

    expect(getVisibleWindow(sessions, today).sessions).toEqual([])
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
      bgColor: "#a6e3b6",
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
