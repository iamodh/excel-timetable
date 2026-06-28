import { describe, it, expect } from "vitest"
import { computeCourseProgress } from "./progress"
import type { Slot, TimetableData, Week } from "./parser"

function makeSlot(title: string, rowSpan = 1, isMergedContinuation = false): Slot {
  return {
    startTime: "10:00",
    endTime: "11:00",
    title,
    subtitle: null,
    bgColor: "#ffffff",
    textColor: "#000000",
    rowSpan,
    isMergedContinuation,
    venue: null,
  }
}

// 6/2: A(2시간 병합) + 병합 연속 셀(미카운트) + B(1시간) = 3시간
// 6/4: C(1시간), 6/9: D(2시간), 6/11: E(1시간) → 전체 4일 / 7시간 / 2주차
function makeFixture(): TimetableData {
  const weeks: Week[] = [
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
    {
      weekNumber: 2,
      days: [
        { dayOfWeek: "화", date: "6/9", slots: [makeSlot("D", 2)] },
        { dayOfWeek: "목", date: "6/11", slots: [makeSlot("E", 1)] },
      ],
    },
  ]
  return {
    programName: "테스트",
    period: "2026.06.01 ~ 2026.07.31",
    location: "",
    totalHours: "",
    categories: [],
    weeks,
  }
}

describe("computeCourseProgress", () => {
  it("진행 중이면 오늘까지의 수업일·시간·주차를 집계한다 (병합 연속 셀은 시간에서 제외)", () => {
    // 오늘 6/9: 6/2·6/4·6/9 완료(3일), 시간 3+1+2=6, 2주차 진행 중
    const progress = computeCourseProgress(makeFixture(), new Date(2026, 5, 9))

    expect(progress).toEqual({
      phase: "ongoing",
      classDay: 3,
      totalClassDays: 4,
      percent: 75,
      currentWeek: 2,
      totalWeeks: 2,
      pastHours: 6,
      totalHours: 7,
      daysUntilStart: 0,
    })
  })

  it("개강 전이면 진행도 0, 개강까지 남은 일수를 알려준다", () => {
    // 오늘 5/30: 첫 수업 6/2까지 3일
    const progress = computeCourseProgress(makeFixture(), new Date(2026, 4, 30))

    expect(progress).toEqual({
      phase: "before",
      classDay: 0,
      totalClassDays: 4,
      percent: 0,
      currentWeek: 0,
      totalWeeks: 2,
      pastHours: 0,
      totalHours: 7,
      daysUntilStart: 3,
    })
  })

  it("마지막 수업일이 지나면 수료 완료로 100%를 반환한다", () => {
    // 오늘 6/20: 마지막 수업 6/11 지남
    const progress = computeCourseProgress(makeFixture(), new Date(2026, 5, 20))

    expect(progress).toEqual({
      phase: "done",
      classDay: 4,
      totalClassDays: 4,
      percent: 100,
      currentWeek: 2,
      totalWeeks: 2,
      pastHours: 7,
      totalHours: 7,
      daysUntilStart: 0,
    })
  })
})
