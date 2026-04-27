import { describe, expect, it } from "vitest"
import { getCategoryTargetHours } from "./categoryTargets"

describe("getCategoryTargetHours", () => {
  it("기본 카테고리는 16시간, 예외 카테고리는 목표 없음으로 반환한다", () => {
    expect(getCategoryTargetHours("밀착상담")).toBe(16)
    expect(getCategoryTargetHours("사례관리")).toBe(16)
    expect(getCategoryTargetHours("지역맞춤 특화")).toBeNull()
    expect(getCategoryTargetHours("외부연계")).toBeNull()
    expect(getCategoryTargetHours("자율")).toBeNull()
  })
})
