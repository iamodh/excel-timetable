import { describe, it, expect } from "vitest"
import { applyMerges, parseHeader, parseGridSlots, parseCategories, parseWeekHeader } from "./parser"

describe("parseCategories", () => {
  it("범례 행에서 카테고리명과 배경색을 추출한다", () => {
    const rowData = [
      {
        values: [
          {
            formattedValue: "밀착상담",
            effectiveFormat: { backgroundColor: { red: 0.85, green: 0.92, blue: 0.83 } },
          },
          {
            formattedValue: "사례관리",
            effectiveFormat: { backgroundColor: { red: 0.96, green: 0.65, blue: 0.38 } },
          },
          {
            formattedValue: "자신감회복",
            effectiveFormat: { backgroundColor: { red: 0.94, green: 0.89, blue: 0.68 } },
          },
        ],
      },
      {
        values: [
          {
            formattedValue: "외부연계",
            effectiveFormat: { backgroundColor: { red: 0.78, green: 0.78, blue: 0.78 } },
          },
          {
            formattedValue: "자율",
            effectiveFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } },
          },
          {}, // 빈 셀
        ],
      },
    ]

    const categories = parseCategories(rowData)

    expect(categories).toEqual([
      { name: "밀착상담", color: "#d9ebd4" },
      { name: "사례관리", color: "#f5a661" },
      { name: "자신감회복", color: "#f0e3ad" },
      { name: "외부연계", color: "#c7c7c7" },
      { name: "자율", color: "#ffffff" },
    ])
  })
})

describe("applyMerges", () => {
  it("병합 셀의 rowSpan과 isMergedContinuation을 설정한다", () => {
    // 5행 x 1열 슬롯 배열 (시간대 5개, 요일 1개)
    const slots = Array.from({ length: 5 }, () => [
      { rowSpan: 1, isMergedContinuation: false },
    ])

    // 행 1~2를 병합 (2시간 수업)
    const merges = [
      { startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 },
    ]

    applyMerges(slots, merges)

    expect(slots[1][0].rowSpan).toBe(2)
    expect(slots[1][0].isMergedContinuation).toBe(false)
    expect(slots[2][0].rowSpan).toBe(1)
    expect(slots[2][0].isMergedContinuation).toBe(true)

    // 병합되지 않은 셀은 기본값 유지
    expect(slots[0][0].rowSpan).toBe(1)
    expect(slots[0][0].isMergedContinuation).toBe(false)
    expect(slots[3][0].rowSpan).toBe(1)
    expect(slots[3][0].isMergedContinuation).toBe(false)
  })
})

describe("parseHeader", () => {
  it("헤더 영역에서 programName, period, location, totalHours를 추출한다", () => {
    const rowData = [
      {
        values: [
          { formattedValue: "장기 1기 - 2회차" },
          {},
          { formattedValue: "2026.04.07 ~ 2026.05.11" },
          {},
          { formattedValue: "교육장소 : 청년어울림센터(장유)" },
          {},
        ],
      },
      {
        values: [
          { formattedValue: "40h" },
          {}, {}, {}, {}, {},
        ],
      },
    ]

    const header = parseHeader(rowData)

    expect(header.programName).toBe("장기 1기 - 2회차")
    expect(header.period).toBe("2026.04.07 ~ 2026.05.11")
    expect(header.location).toBe("청년어울림센터(장유)")
    expect(header.totalHours).toBe("40h")
  })
})

describe("parseWeekHeader", () => {
  it("주차 라벨 행에서 weekNumber와 요일/날짜를 추출한다", () => {
    const row = {
      values: [
        { formattedValue: "1주차" },
        { formattedValue: "4/7(Tue)" },
        { formattedValue: "4/8(Wed)" },
        { formattedValue: "4/9(Thu)" },
        { formattedValue: "4/10(Fri)" },
        { formattedValue: "4/13(Mon)" },
      ],
    }

    const header = parseWeekHeader(row)

    expect(header.weekNumber).toBe(1)
    expect(header.days).toEqual([
      { date: "4/7", dayOfWeek: "Tue" },
      { date: "4/8", dayOfWeek: "Wed" },
      { date: "4/9", dayOfWeek: "Thu" },
      { date: "4/10", dayOfWeek: "Fri" },
      { date: "4/13", dayOfWeek: "Mon" },
    ])
  })
})

describe("parseGridSlots", () => {
  it("셀 값과 배경색을 파싱하고, 빈 셀은 빈 title과 #ffffff로 처리한다", () => {
    // 2행(시간대) x 열0(시간) + 열1~2(요일 2개) 최소 그리드
    const rowData = [
      {
        values: [
          { formattedValue: "09:00~10:00" },
          {
            formattedValue: "기초상담 (1)\n미네르바에듀",
            effectiveFormat: { backgroundColor: { red: 0.66, green: 0.84, blue: 0.63 } },
          },
          {}, // 빈 셀
        ],
      },
      {
        values: [
          { formattedValue: "10:00~11:00" },
          {}, // 빈 셀
          {
            formattedValue: "사례관리",
            effectiveFormat: { backgroundColor: { red: 0.96, green: 0.65, blue: 0.38 } },
          },
        ],
      },
    ]

    const slots = parseGridSlots(rowData)

    // 값 있는 셀: title, subtitle, bgColor, startTime, endTime 추출
    expect(slots[0][0].title).toBe("기초상담 (1)")
    expect(slots[0][0].subtitle).toBe("미네르바에듀")
    expect(slots[0][0].bgColor).toBe("#a8d6a1")
    expect(slots[0][0].startTime).toBe("09:00")
    expect(slots[0][0].endTime).toBe("10:00")

    // 빈 셀: 빈 title, #ffffff
    expect(slots[0][1].title).toBe("")
    expect(slots[0][1].subtitle).toBeNull()
    expect(slots[0][1].bgColor).toBe("#ffffff")

    // 두 번째 시간대
    expect(slots[1][0].title).toBe("")
    expect(slots[1][0].bgColor).toBe("#ffffff")
    expect(slots[1][1].title).toBe("사례관리")
    expect(slots[1][1].bgColor).toBe("#f5a661")
    expect(slots[1][1].startTime).toBe("10:00")
    expect(slots[1][1].endTime).toBe("11:00")
  })
})
