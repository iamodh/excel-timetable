import { isCloseColor } from "./color"
import type { Category, TimetableData } from "./parser"

export interface CategorySessionHours {
  categoryName: string
  color: string
  sessionHours: number[]
  totalHours: number
}

export function summarizeCategoryHoursBySession(sessions: TimetableData[]): CategorySessionHours[] {
  const categories = collectCategories(sessions)
  return categories.map((category) => {
    const sessionHours = sessions.map((session) => sumCategoryHours(session, category.color))
    return {
      categoryName: category.name,
      color: category.color,
      sessionHours,
      totalHours: sessionHours.reduce((sum, hours) => sum + hours, 0),
    }
  })
}

function collectCategories(sessions: TimetableData[]): Category[] {
  const categoriesByName = new Map<string, Category>()
  for (const session of sessions) {
    for (const category of session.categories) {
      if (!categoriesByName.has(category.name)) {
        categoriesByName.set(category.name, category)
      }
    }
  }
  return Array.from(categoriesByName.values())
}

function sumCategoryHours(session: TimetableData, color: string): number {
  let hours = 0
  for (const week of session.weeks) {
    for (const day of week.days) {
      for (const slot of day.slots) {
        if (slot.isMergedContinuation || !isCloseColor(slot.bgColor, color)) continue
        hours += slot.rowSpan
      }
    }
  }
  return hours
}
