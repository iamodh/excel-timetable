const NO_TARGET_CATEGORIES = new Set(["지역맞춤 특화", "외부연계", "자율"])
const DEFAULT_TARGET_HOURS = 16

export function getCategoryTargetHours(name: string): number | null {
  return NO_TARGET_CATEGORIES.has(name) ? null : DEFAULT_TARGET_HOURS
}
