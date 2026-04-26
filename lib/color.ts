export function toHexColor(bgColor?: { red?: number; green?: number; blue?: number }): string {
  if (!bgColor) return "#ffffff"
  const r = Math.round((bgColor.red ?? 0) * 255)
  const g = Math.round((bgColor.green ?? 0) * 255)
  const b = Math.round((bgColor.blue ?? 0) * 255)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

export function toTextColor(color?: { red?: number; green?: number; blue?: number }): string {
  if (!color) return "#000000"
  const r = Math.round((color.red ?? 0) * 255)
  const g = Math.round((color.green ?? 0) * 255)
  const b = Math.round((color.blue ?? 0) * 255)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}
