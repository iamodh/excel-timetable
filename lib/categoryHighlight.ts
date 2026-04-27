import { isCloseColor } from "./color"
import type { Category } from "./parser"

export function shouldDimSlotForCategory(
  slotColor: string,
  categories: Category[],
  highlightCategory?: string
): boolean {
  if (!highlightCategory) return false
  const category = categories.find((cat) => cat.name === highlightCategory)
  if (!category) return false
  return !isCloseColor(slotColor, category.color)
}
