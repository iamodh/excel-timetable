import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn(),
}))

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("관리자 인증 실패 시 401 응답", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth")
    vi.mocked(verifyAdminToken).mockReturnValue(false)

    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/revalidate", {
      method: "POST",
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it("관리자 인증 후 revalidatePath 호출 + 200 응답", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth")
    vi.mocked(verifyAdminToken).mockReturnValue(true)

    const { revalidatePath } = await import("next/cache")
    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/revalidate", {
      method: "POST",
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/")
  })
})
