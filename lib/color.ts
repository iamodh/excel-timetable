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

// 매니저가 색을 칠할 때 1~2단계 음영이 다른 회색을 섞어 쓰는 사례가 있어,
// 채널당 ±2/255 이내 차이는 같은 색으로 본다 (시각적으로 구분 불가능한 수준).
const COLOR_TOLERANCE = 2

export function isCloseColor(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length !== 7 || b.length !== 7) return false
  const aR = parseInt(a.slice(1, 3), 16)
  const aG = parseInt(a.slice(3, 5), 16)
  const aB = parseInt(a.slice(5, 7), 16)
  const bR = parseInt(b.slice(1, 3), 16)
  const bG = parseInt(b.slice(3, 5), 16)
  const bB = parseInt(b.slice(5, 7), 16)
  return (
    Math.abs(aR - bR) <= COLOR_TOLERANCE &&
    Math.abs(aG - bG) <= COLOR_TOLERANCE &&
    Math.abs(aB - bB) <= COLOR_TOLERANCE
  )
}
