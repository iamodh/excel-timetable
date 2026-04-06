import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSpreadsheetGet = vi.fn()

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn(),
    },
    sheets: () => ({
      spreadsheets: {
        get: mockSpreadsheetGet,
      },
    }),
  },
}))

describe("fetchTimetableData", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    mockSpreadsheetGet.mockReset()
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

  it("API 응답을 받아 raw 데이터 반환", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", '{"type":"service_account"}')
    vi.stubEnv("GOOGLE_SHEET_ID", "test-sheet-id")

    const mockData = {
      sheets: [
        {
          properties: { title: "1주차" },
          data: [{ rowData: [{ values: [{ formattedValue: "테스트" }] }] }],
          merges: [],
        },
      ],
    }
    mockSpreadsheetGet.mockResolvedValue({ data: mockData })

    const { fetchTimetableData } = await import("./sheets")
    const result = await fetchTimetableData()

    expect(result).toEqual(mockData)
    expect(mockSpreadsheetGet).toHaveBeenCalledWith({
      spreadsheetId: "test-sheet-id",
      includeGridData: true,
    })
  })
})
