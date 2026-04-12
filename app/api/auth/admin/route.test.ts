import { describe, it, expect, vi, beforeEach } from "vitest"

describe("POST /api/auth/admin", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it("비밀번호 일치 시 admin_token 쿠키 설정 + 200 응답", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "secret123")

    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/auth/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "secret123" }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("set-cookie")).toContain("admin_token=")
  })

  it("비밀번호 불일치 시 401 응답 + 쿠키 미설정", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "secret123")

    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/auth/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(response.headers.get("set-cookie")).toBeNull()
    const body = await response.json()
    expect(body.message).toBe("비밀번호가 올바르지 않습니다.")
  })
})
