import { describe, expect, it } from "vitest"
import { summarizeCategoryHoursBySession } from "./categoryStats"
import type { TimetableData } from "./parser"

const makeSession = (programName: string, overrides: Partial<TimetableData> = {}): TimetableData => ({
  programName,
  period: "2026.04.07 ~ 2026.05.11",
  location: "장유",
  totalHours: "40h",
  categories: [
    { name: "밀착상담", color: "#d9ebd4" },
    { name: "사례관리", color: "#f5a661" },
    { name: "외부연계", color: "#c7c7c7" },
  ],
  weeks: [],
  ...overrides,
})

describe("summarizeCategoryHoursBySession", () => {
  it("색상 매칭으로 회차별 카테고리 시간을 합산하고 병합 연속 셀은 제외한다", () => {
    const sessions = [
      makeSession("1회차", {
        weeks: [
          {
            weekNumber: 1,
            days: [
              {
                dayOfWeek: "화",
                date: "4/7",
                slots: [
                  {
                    startTime: "09:00",
                    endTime: "10:00",
                    title: "상담",
                    subtitle: null,
                    bgColor: "#d9ebd4",
                    textColor: "#000000",
                    rowSpan: 2,
                    isMergedContinuation: false,
                  },
                  {
                    startTime: "10:00",
                    endTime: "11:00",
                    title: "",
                    subtitle: null,
                    bgColor: "#d9ebd4",
                    textColor: "#000000",
                    rowSpan: 1,
                    isMergedContinuation: true,
                  },
                  {
                    startTime: "11:00",
                    endTime: "12:00",
                    title: "사례",
                    subtitle: null,
                    bgColor: "#f5a661",
                    textColor: "#000000",
                    rowSpan: 1,
                    isMergedContinuation: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
      makeSession("2회차", {
        weeks: [
          {
            weekNumber: 1,
            days: [
              {
                dayOfWeek: "수",
                date: "5/13",
                slots: [
                  {
                    startTime: "09:00",
                    endTime: "10:00",
                    title: "연계",
                    subtitle: null,
                    bgColor: "#c8c7c5",
                    textColor: "#000000",
                    rowSpan: 3,
                    isMergedContinuation: false,
                  },
                  {
                    startTime: "10:00",
                    endTime: "11:00",
                    title: "",
                    subtitle: null,
                    bgColor: "#c7c7c7",
                    textColor: "#000000",
                    rowSpan: 1,
                    isMergedContinuation: true,
                  },
                  {
                    startTime: "11:00",
                    endTime: "12:00",
                    title: "",
                    subtitle: null,
                    bgColor: "#c7c7c7",
                    textColor: "#000000",
                    rowSpan: 1,
                    isMergedContinuation: true,
                  },
                  {
                    startTime: "12:00",
                    endTime: "13:00",
                    title: "분류 없음",
                    subtitle: null,
                    bgColor: "#ffffff",
                    textColor: "#000000",
                    rowSpan: 1,
                    isMergedContinuation: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ]

    expect(summarizeCategoryHoursBySession(sessions)).toEqual([
      {
        categoryName: "밀착상담",
        color: "#d9ebd4",
        sessionHours: [2, 0],
        totalHours: 2,
      },
      {
        categoryName: "사례관리",
        color: "#f5a661",
        sessionHours: [1, 0],
        totalHours: 1,
      },
      {
        categoryName: "외부연계",
        color: "#c7c7c7",
        sessionHours: [0, 3],
        totalHours: 3,
      },
    ])
  })
})
