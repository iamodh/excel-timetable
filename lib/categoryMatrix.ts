import { getCategoryTargetHours } from "./categoryTargets"
import type { CategorySessionHours } from "./categoryStats"

export interface CategoryMatrixRow extends CategorySessionHours {
  targetHours: number | null
  remainingHours: number | null
}

export function buildCategoryMatrixRows(
  summaries: CategorySessionHours[]
): CategoryMatrixRow[] {
  return summaries
    .map((summary) => {
      const targetHours = getCategoryTargetHours(summary.categoryName)
      return {
        ...summary,
        targetHours,
        remainingHours: targetHours === null ? null : targetHours - summary.totalHours,
      }
    })
    .sort(compareCategoryMatrixRows)
}

function compareCategoryMatrixRows(a: CategoryMatrixRow, b: CategoryMatrixRow): number {
  if (a.targetHours === null && b.targetHours !== null) return 1
  if (a.targetHours !== null && b.targetHours === null) return -1
  if (a.remainingHours !== null && b.remainingHours !== null) {
    return b.remainingHours - a.remainingHours
  }
  return a.categoryName.localeCompare(b.categoryName, "ko")
}
