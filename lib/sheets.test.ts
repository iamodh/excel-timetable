import { describe, it, expect, vi, beforeEach } from "vitest"

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
