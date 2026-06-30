import { describe, it, expect } from "vitest"
import { computeOverallProgress } from "./progress"
import type { Slot, TimetableData, Week } from "./parser"

function makeSlot(title: string, rowSpan = 1, isMergedContinuation = false): Slot {
  return {
    startTime: "10:00",
    endTime: "11:00",
    title,
    subtitle: null,
    bgColor: "#a6e3b6",
    textColor: "#000000",
    rowSpan,
    isMergedContinuation,
    venue: null,
  }
}

function makeTimedSlot(title: string, startTime: string, endTime: string, rowSpan = 1): Slot {
  return { ...makeSlot(title, rowSpan), startTime, endTime }
}

function makeSession(programName: string, period: string, weeks: Week[]): TimetableData {
  return { programName, period, location: "", totalHours: "", categories: [], weeks }
}

// 1회차 6/2: A(2시간 병합) + 병합 연속(미카운트) + B(1시간) = 3시간, 6/4: C(1시간)
// 2회차 6/9: D(2시간), 6/11: E(1시간)
// 전 회차 합산 → 4일 / 7시간
function makeSessions(): TimetableData[] {
  return [
    makeSession("1회차", "2026.06.01 ~ 2026.06.30", [
      {
        weekNumber: 1,
        days: [
          {
            dayOfWeek: "화",
            date: "6/2",
            slots: [makeSlot("A", 2), makeSlot("", 1, true), makeSlot("B", 1)],
          },
          { dayOfWeek: "목", date: "6/4", slots: [makeSlot("C", 1)] },
        ],
      },
    ]),
    makeSession("2회차", "2026.06.07 ~ 2026.07.31", [
      {
        weekNumber: 1,
        days: [
          { dayOfWeek: "화", date: "6/9", slots: [makeSlot("D", 2)] },
          { dayOfWeek: "목", date: "6/11", slots: [makeSlot("E", 1)] },
        ],
      },
    ]),
  ]
}

describe("computeOverallProgress", () => {
  it("진행 중이면 전 회차 이수 시간을 합산해 진행률을 계산한다", () => {
    // 오늘 6/9 12:00(수업 종료 11:00 이후): 6/2·6/4(1회차)·6/9(2회차) 완료 → 이수 3+1+2=6 / 전체 7시간 → 86%
    const progress = computeOverallProgress(makeSessions(), new Date(2026, 5, 9, 12, 0))

    expect(progress).toEqual({
      phase: "ongoing",
      percent: 86,
      pastHours: 6,
      totalHours: 7,
      daysUntilStart: 0,
    })
  })

  it("오늘이 수업일이어도 수업 종료 전이면 오늘 수업 시간은 미집계한다", () => {
    // 오늘 6/9 09:00(수업 종료 11:00 이전): 6/2·6/4만 완료 → 이수 3+1=4 / 전체 7시간 → 57%
    const progress = computeOverallProgress(makeSessions(), new Date(2026, 5, 9, 9, 0))

    expect(progress).toEqual({
      phase: "ongoing",
      percent: 57,
      pastHours: 4,
      totalHours: 7,
      daysUntilStart: 0,
    })
  })

  it("하루에 수업이 여럿이면 끝난 수업만 부분 집계한다", () => {
    // 6/2 한 날에 오전(09~11, 2h)·오후(13~15, 2h). 전체 4시간.
    const sessions = [
      makeSession("1회차", "2026.06.01 ~ 2026.06.30", [
        {
          weekNumber: 1,
          days: [
            {
              dayOfWeek: "화",
              date: "6/2",
              slots: [
                makeTimedSlot("오전", "09:00", "11:00", 2),
                makeTimedSlot("오후", "13:00", "15:00", 2),
              ],
            },
          ],
        },
      ]),
    ]

    // 12:00: 오전(종료 11:00)만 이수 → 2/4 = 50%
    const atNoon = computeOverallProgress(sessions, new Date(2026, 5, 2, 12, 0))
    expect(atNoon.pastHours).toBe(2)
    expect(atNoon.percent).toBe(50)

    // 16:00: 오전·오후 모두 이수 → 4/4 = 100%
    const afterAll = computeOverallProgress(sessions, new Date(2026, 5, 2, 16, 0))
    expect(afterAll.pastHours).toBe(4)
    expect(afterAll.percent).toBe(100)
  })

  it("첫 회차 개강 전이면 진행도 0, 개강까지 남은 일수를 알려준다", () => {
    // 오늘 5/30: 전 회차 통틀어 첫 수업 6/2까지 3일
    const progress = computeOverallProgress(makeSessions(), new Date(2026, 4, 30))

    expect(progress).toEqual({
      phase: "before",
      percent: 0,
      pastHours: 0,
      totalHours: 7,
      daysUntilStart: 3,
    })
  })

  it("마지막 회차의 마지막 수업일이 지나면 수료 완료로 100%를 반환한다", () => {
    // 오늘 6/20: 전 회차 마지막 수업 6/11 지남
    const progress = computeOverallProgress(makeSessions(), new Date(2026, 5, 20))

    expect(progress).toEqual({
      phase: "done",
      percent: 100,
      pastHours: 7,
      totalHours: 7,
      daysUntilStart: 0,
    })
  })
})
