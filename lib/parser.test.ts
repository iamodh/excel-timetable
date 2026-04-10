import { describe, it, expect } from "vitest"
import { applyMerges, parseHeader, parseGridSlots, parseCategories, parseWeekHeader, parseTimetable } from "./parser"

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
  it("폰트 색상(foregroundColor)을 textColor로 추출하며, 지정되지 않은 셀은 #000000을 반환한다", () => {
    const rowData = [
      {
        values: [
          { formattedValue: "09:00~10:00" },
          {
            formattedValue: "어린이날",
            effectiveFormat: {
              textFormat: { foregroundColor: { red: 1, green: 0, blue: 0 } },
            },
          },
          { formattedValue: "정상 수업" }, // textFormat 없음
        ],
      },
    ]

    const slots = parseGridSlots(rowData)

    expect(slots[0][0].textColor).toBe("#ff0000")
    expect(slots[0][1].textColor).toBe("#000000")
  })

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

describe("parseTimetable", () => {
  it("전체 시트 데이터를 TimetableData로 변환한다", () => {
    // 범례 2행 + 헤더 2행 + 1주차 (요일헤더 1행 + 시간슬롯 8행) = 13행
    const rowData = [
      // 행0: 범례 1행
      {
        values: [
          { formattedValue: "밀착상담", effectiveFormat: { backgroundColor: { red: 0.85, green: 0.92, blue: 0.83 } } },
          { formattedValue: "사례관리", effectiveFormat: { backgroundColor: { red: 0.96, green: 0.65, blue: 0.38 } } },
        ],
      },
      // 행1: 범례 2행
      { values: [{ formattedValue: "외부연계", effectiveFormat: { backgroundColor: { red: 0.78, green: 0.78, blue: 0.78 } } }] },
      // 행2: 헤더 - 프로그램명, 기간, 장소
      {
        values: [
          { formattedValue: "장기1기 - 2회차" }, {},
          { formattedValue: "2026.04.07 ~ 2026.05.11" }, {},
          { formattedValue: "교육장소 : 청년어울림센터(장유)" }, {},
        ],
      },
      // 행3: 이수시간
      { values: [{ formattedValue: "40h" }, {}, {}, {}, {}, {}] },
      // 행4: 1주차 요일 헤더
      {
        values: [
          { formattedValue: "1주차" },
          { formattedValue: "4/7(Tue)" },
          { formattedValue: "4/8(Wed)" },
        ],
      },
      // 행5~12: 시간슬롯 8행 (2행만 데이터, 나머지 빈 행)
      {
        values: [
          { formattedValue: "09:00~10:00" },
          { formattedValue: "기초상담 (1)\n미네르바에듀", effectiveFormat: { backgroundColor: { red: 0.85, green: 0.92, blue: 0.83 } } },
          {},
        ],
      },
      {
        values: [
          { formattedValue: "10:00~11:00" },
          {},
          { formattedValue: "사례관리", effectiveFormat: { backgroundColor: { red: 0.96, green: 0.65, blue: 0.38 } } },
        ],
      },
      // 행7~12: 빈 시간슬롯
      { values: [{ formattedValue: "11:00~12:00" }, {}, {}] },
      { values: [{ formattedValue: "12:00~13:00" }, {}, {}] },
      { values: [{ formattedValue: "13:00~14:00" }, {}, {}] },
      { values: [{ formattedValue: "14:00~15:00" }, {}, {}] },
      { values: [{ formattedValue: "15:00~16:00" }, {}, {}] },
      { values: [{ formattedValue: "16:00~17:00" }, {}, {}] },
    ]

    const merges = [
      // 헤더 병합 (열 방향) - 파싱에 영향 없음
      { startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 2 },
    ]

    const result = parseTimetable(rowData, merges)

    // 헤더
    expect(result.programName).toBe("장기1기 - 2회차")
    expect(result.period).toBe("2026.04.07 ~ 2026.05.11")
    expect(result.location).toBe("청년어울림센터(장유)")
    expect(result.totalHours).toBe("40h")

    // 카테고리
    expect(result.categories).toHaveLength(3)
    expect(result.categories[0].name).toBe("밀착상담")

    // 주차
    expect(result.weeks).toHaveLength(1)
    expect(result.weeks[0].weekNumber).toBe(1)

    // 요일
    expect(result.weeks[0].days).toHaveLength(2)
    expect(result.weeks[0].days[0].date).toBe("4/7")
    expect(result.weeks[0].days[0].dayOfWeek).toBe("Tue")

    // 슬롯
    expect(result.weeks[0].days[0].slots).toHaveLength(8)
    expect(result.weeks[0].days[0].slots[0].title).toBe("기초상담 (1)")
    expect(result.weeks[0].days[0].slots[0].subtitle).toBe("미네르바에듀")
    expect(result.weeks[0].days[0].slots[0].startTime).toBe("09:00")
    expect(result.weeks[0].days[0].slots[0].endTime).toBe("10:00")
    expect(result.weeks[0].days[0].slots[0].bgColor).toBe("#d9ebd4")

    // 빈 슬롯
    expect(result.weeks[0].days[0].slots[1].title).toBe("")
    expect(result.weeks[0].days[0].slots[1].bgColor).toBe("#ffffff")

    // 두 번째 요일
    expect(result.weeks[0].days[1].slots[1].title).toBe("사례관리")
    expect(result.weeks[0].days[1].slots[1].bgColor).toBe("#f5a661")
  })
})
