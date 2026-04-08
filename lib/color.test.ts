import { describe, it, expect } from "vitest"
import { toHexColor } from "./color"

describe("toHexColor", () => {
  it("RGB(0~1) 소수를 hex 문자열로 변환한다", () => {
    expect(toHexColor({ red: 0.66, green: 0.84, blue: 0.63 })).toBe("#a8d6a1")
  })

  it("배경색 없는 셀(undefined) → #ffffff 반환", () => {
    expect(toHexColor(undefined)).toBe("#ffffff")
  })
})
