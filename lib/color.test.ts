import { describe, it, expect } from "vitest"
import { isCloseColor, toHexColor } from "./color"

describe("toHexColor", () => {
  it("RGB(0~1) 소수를 hex 문자열로 변환한다", () => {
    expect(toHexColor({ red: 0.66, green: 0.84, blue: 0.63 })).toBe("#a8d6a1")
  })

  it("배경색 없는 셀(undefined) → #ffffff 반환", () => {
    expect(toHexColor(undefined)).toBe("#ffffff")
  })

  it("구글 시트가 생략한 색상 채널은 0으로 처리한다", () => {
    expect(toHexColor({ red: 1, green: 0.7529412 })).toBe("#ffc000")
  })
})

describe("isCloseColor", () => {
  it("채널당 2 이내 차이는 같은 색으로 본다", () => {
    expect(isCloseColor("#c7c7c7", "#c8c7c5")).toBe(true)
    expect(isCloseColor("#c7c7c7", "#cac7c7")).toBe(false)
  })
})
