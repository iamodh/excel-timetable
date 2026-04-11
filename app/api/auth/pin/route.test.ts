import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/pin", () => ({
  getStoredPin: vi.fn(),
}))

describe("POST /api/auth/pin", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("PIN 일치 시 student_pin 쿠키 설정 + 200 응답", async () => {
    const { getStoredPin } = await import("@/lib/pin")
    vi.mocked(getStoredPin).mockResolvedValue("1234")

    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/auth/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    const setCookie = response.headers.get("set-cookie")
    expect(setCookie).toContain("student_pin=1234")
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("Max-Age=2592000")
    expect(setCookie).toContain("Path=/")
    expect(setCookie).toContain("SameSite=Lax")
  })
})
