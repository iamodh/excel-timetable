import { describe, it, expect, vi, beforeEach } from "vitest"
import { extractFirstTabSessions } from "./sheets"

describe("fetchTimetableData", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("환경변수 미설정 시 명확한 에러 발생", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "")
    vi.stubEnv("GOOGLE_SHEET_ID", "")

    const { fetchTimetableData } = await import("./sheets")

    await expect(fetchTimetableData()).rejects.toThrow(
      "GOOGLE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다."
    )
  })

  it("GOOGLE_SHEET_ID만 미설정 시 에러 발생", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", '{"type":"service_account"}')
    vi.stubEnv("GOOGLE_SHEET_ID", "")

    const { fetchTimetableData } = await import("./sheets")

    await expect(fetchTimetableData()).rejects.toThrow(
      "GOOGLE_SHEET_ID 환경변수가 설정되지 않았습니다."
    )
  })
})

describe("extractFirstTabSessions", () => {
  it("첫 행+첫 열 빈 패딩이 있는 시트에서 두 번째 행/열부터 파싱하며, 여러 탭 중 첫 번째 탭만 사용한다", () => {
    const spreadsheet = {
      sheets: [
        {
          properties: { title: "현재학기" },
          data: [{
            rowData: [
              { values: [] }, // 빈 첫 행
              { values: [{}, {}, {}] }, { values: [{}, {}, {}] },
              {
                values: [
                  {}, // 빈 첫 열
                  { formattedValue: "현재-1회차" }, {},
                  { formattedValue: "2026.04.07 ~ 2026.05.11" }, {},
                  { formattedValue: "교육장소 : 장유" }, {},
                ],
              },
              { values: [{}, { formattedValue: "40h" }, {}, {}, {}, {}, {}] },
            ],
          }],
          merges: [],
        },
        {
          properties: { title: "과거학기" },
          data: [{
            rowData: [
              { values: [] },
              { values: [{}, {}, {}] }, { values: [{}, {}, {}] },
              {
                values: [
                  {},
                  { formattedValue: "과거-1회차" }, {},
                  { formattedValue: "2025.09.01 ~ 2025.12.31" }, {},
                  { formattedValue: "교육장소 : 진영" }, {},
                ],
              },
              { values: [{}, { formattedValue: "32h" }, {}, {}, {}, {}, {}] },
            ],
          }],
          merges: [],
        },
      ],
    }

    const sessions = extractFirstTabSessions(spreadsheet)

    expect(sessions).toHaveLength(1)
    expect(sessions[0].programName).toBe("현재-1회차")
    expect(sessions[0].location).toBe("장유")
  })

  it("탭이 없는 응답은 빈 배열을 반환한다", () => {
    expect(extractFirstTabSessions({ sheets: [] })).toEqual([])
    expect(extractFirstTabSessions({})).toEqual([])
  })
})
