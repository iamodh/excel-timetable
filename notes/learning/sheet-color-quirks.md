# Google Sheets 색상 데이터의 함정

Google Sheets API가 셀 배경색을 돌려주는 방식에는 두 가지 파싱 함정이 있다. 둘 다 매니저가 색으로 시간표 블록을 표시하는 워크플로에서 자동 병합 추론을 망가뜨릴 수 있다.

---

## 1. 배경색 데이터 형태

Sheets API는 배경색을 RGB 0~1 범위 float로 반환한다.

```ts
// API 응답의 cellData.effectiveFormat.backgroundColor
{ red?: number; green?: number; blue?: number }
```

이걸 비교 가능한 hex 문자열로 정규화한다.

```ts
export function toHexColor(bgColor?: { red?: number; green?: number; blue?: number }): string {
  if (!bgColor) return "#ffffff"
  const r = Math.round((bgColor.red ?? 0) * 255)
  const g = Math.round((bgColor.green ?? 0) * 255)
  const b = Math.round((bgColor.blue ?? 0) * 255)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}
```

채널 누락(`undefined`)은 0으로 채운다. 객체 자체가 없으면 `#ffffff` (흰색)로 채운다.

---

## 2. 함정 ① — "배경 미설정"과 "명시적 흰색"이 구분 불가

`backgroundColor` 객체가 없는 셀(매니저가 색을 안 칠한 빈 배경)을 `toHexColor`는 `#ffffff`로 반환한다. 매니저가 흰색을 명시적으로 칠한 셀도 `#ffffff`로 반환된다. 두 셀이 데이터에선 동일하다.

이 프로젝트는 `자율` 같은 흰색 카테고리가 있어서 매니저가 흰색을 의도적으로 사용하기도 한다. 그래서 "이 셀이 배경 없는 빈 셀인가, 흰색 카테고리인가"를 색만 보고 판정할 수 없다.

### 대응 — 흰색 근사값은 자동 병합 대상에서 제외

```ts
function isNoBgColor(color: string): boolean {
  return !color || isCloseColor(color, "#ffffff")
}
```

흰색 근사값(`#ffffff` ±2/255 이내)은 자동 병합 추론에서 제외한다. 매니저가 색을 비워둔 의도를 존중하고, 흰색 카테고리 블록은 명시적 Excel 병합으로 보충하도록 운영적으로 위임한다.

자동 보정의 안전성과 흰색 카테고리 자동 처리 사이의 트레이드오프 — 후자를 포기했다. 흰색끼리 잘못 병합되는 위험이 더 크기 때문.

---

## 3. 함정 ② — 시각적으로 같은 색이 정확 비교에서 다름

매니저가 색 picker에서 같은 색을 다시 고를 때 1단계 다른 음영을 골라 쓰는 일이 잦다. 5회차 2주차 7/28(화) `(김해대)` 케이스에서 발견됐다.

```
한 셀:    #d9d9d9   (217/255)
나머지:   #d8d8d8   (216/255)
```

채널값 1 차이. 시각적으로 구분 불가능하지만 `===` 비교에선 다른 색으로 판정 → 블록 일부만 병합된다.

### 대응 — 채널당 ±2/255 tolerance

```ts
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
```

`±2`는 보수적으로 잡은 값. 사람 눈으로 구분 불가능한 수준이고, 실제 다른 카테고리 색끼리는 보통 채널당 10~50 이상 차이가 나서 충돌 위험 없음.

---

## 4. 두 함정의 결합

자동 병합 추론에서는 두 함수를 둘 다 거쳐야 한다.

```ts
if (isNoBgColor(cur.bgColor) || !isCloseColor(cur.bgColor, top.bgColor)) continue
```

- `isNoBgColor` — 매니저가 색을 안 칠한 셀(또는 명시적 흰색)은 무조건 보정 제외.
- `isCloseColor` — 색 비교 자체는 tolerance 적용.

두 가드 중 하나라도 빠지면 다음 회귀가 일어난다.

| 빠진 가드 | 회귀 |
|----------|------|
| `isNoBgColor` 누락 | 매니저가 색을 안 칠한 진짜 빈 셀들이 서로 같은 색(`#ffffff`)으로 인식되어 무관한 셀끼리 자동 병합됨 |
| `isCloseColor` 누락 (정확 비교만) | 매니저가 1단계 다른 음영을 섞은 블록이 부분 병합으로 깨짐 |

---

## 5. 한계

- 채널당 ±2/255 초과의 음영 차이는 자동 보정 불가. 매니저가 더 다른 색을 섞으면 시트 정리가 필요하다.
- 흰색 카테고리는 자동 병합 대상이 아니므로 매니저가 명시적 Excel 병합을 빼먹으면 UI에서 쪼개진 채로 표시된다.
