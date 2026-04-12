import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/admin-auth", () => ({
  verifyAdminToken: vi.fn(),
}))

vi.mock("@/lib/notice", () => ({
  getNotice: vi.fn(),
  setNotice: vi.fn(),
  deleteNotice: vi.fn(),
}))

describe("POST /api/notice", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("관리자 인증 실패 시 401 응답", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth")
    vi.mocked(verifyAdminToken).mockReturnValue(false)

    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/notice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "공지입니다" }),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it("공지 작성 시 KV에 저장 + 200 응답", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth")
    vi.mocked(verifyAdminToken).mockReturnValue(true)

    const { setNotice } = await import("@/lib/notice")
    const { POST } = await import("./route")

    const request = new Request("http://localhost/api/notice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "4월 시간표 업데이트" }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(vi.mocked(setNotice)).toHaveBeenCalledWith("4월 시간표 업데이트")
  })
})

describe("DELETE /api/notice", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("관리자 인증 후 공지 삭제 + 200 응답", async () => {
    const { verifyAdminToken } = await import("@/lib/admin-auth")
    vi.mocked(verifyAdminToken).mockReturnValue(true)

    const { deleteNotice } = await import("@/lib/notice")
    const { DELETE } = await import("./route")

    const request = new Request("http://localhost/api/notice", {
      method: "DELETE",
    })

    const response = await DELETE(request)

    expect(response.status).toBe(200)
    expect(vi.mocked(deleteNotice)).toHaveBeenCalled()
  })
})
