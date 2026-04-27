import { describe, expect, it } from "vitest"
import { buildCategoryMatrixRows } from "./categoryMatrix"

describe("buildCategoryMatrixRows", () => {
  it("부족분 큰 순으로 정렬하고 목표 없는 카테고리는 마지막에 둔다", () => {
    const rows = buildCategoryMatrixRows([
      {
        categoryName: "사례관리",
        color: "#f5a661",
        sessionHours: [8, 4],
        totalHours: 12,
      },
      {
        categoryName: "외부연계",
        color: "#c7c7c7",
        sessionHours: [2, 1],
        totalHours: 3,
      },
      {
        categoryName: "밀착상담",
        color: "#d9ebd4",
        sessionHours: [6, 1],
        totalHours: 7,
      },
      {
        categoryName: "자신감회복",
        color: "#f0e3ad",
        sessionHours: [16, 1],
        totalHours: 17,
      },
      {
        categoryName: "자율",
        color: "#ffffff",
        sessionHours: [1, 0],
        totalHours: 1,
      },
    ])

    expect(rows.map((row) => row.categoryName)).toEqual([
      "밀착상담",
      "사례관리",
      "자신감회복",
      "외부연계",
      "자율",
    ])
    expect(rows.map((row) => row.remainingHours)).toEqual([9, 4, -1, null, null])
    expect(rows.map((row) => row.targetHours)).toEqual([16, 16, 16, null, null])
  })
})
