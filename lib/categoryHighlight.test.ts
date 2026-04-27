import { describe, expect, it } from "vitest"
import { shouldDimSlotForCategory } from "./categoryHighlight"

const categories = [
  { name: "밀착상담", color: "#d9ebd4" },
  { name: "사례관리", color: "#f5a661" },
]

describe("shouldDimSlotForCategory", () => {
  it("강조 카테고리가 없거나 매칭 색상이면 흐리게 처리하지 않는다", () => {
    expect(shouldDimSlotForCategory("#f5a661", categories)).toBe(false)
    expect(shouldDimSlotForCategory("#f5a661", categories, "사례관리")).toBe(false)
    expect(shouldDimSlotForCategory("#f6a661", categories, "사례관리")).toBe(false)
  })

  it("강조 카테고리와 색상이 다르면 흐리게 처리한다", () => {
    expect(shouldDimSlotForCategory("#d9ebd4", categories, "사례관리")).toBe(true)
    expect(shouldDimSlotForCategory("#ffffff", categories, "사례관리")).toBe(true)
  })
})
