import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/pin", () => ({
  getStoredPin: vi.fn(),
  setStoredPin: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn(),
}))

describe("POST /api/pin", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("관리자 인증 실패 시 401 응답", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth")
    vi.mocked(verifyAdminToken).mockReturnValue(false)

    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "5678" }),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it("관리자 인증 후 새 PIN 저장 + 200 응답", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth")
    vi.mocked(verifyAdminToken).mockReturnValue(true)

    const { setStoredPin } = await import("@/lib/pin")
    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "5678" }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(vi.mocked(setStoredPin)).toHaveBeenCalledWith("5678")
  })
})
