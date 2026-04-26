# 매니저 색칠 실수 보정 — 색 기반 자동 병합

매니저가 시간표 셀을 색으로만 표시하고 명시적 Excel 병합을 빠뜨리거나 색을 일관되게 안 칠하는 패턴이 반복적으로 발견됨. 시각적으론 한 블록이지만 데이터는 분리돼 UI에서 잘게 쪼개짐.

`lib/parser.ts`의 `applyImplicitMerges`가 그리드 파싱 후 한 번 더 순회하며 색 기반으로 병합을 보정한다.

---

## 발견한 4가지 실수 패턴 / 해결책

### 1. 세로 병합 누락 — 색만 칠하고 명시 merge 안 함

3시간 강의를 색으로만 표시. 첫 셀에 강의명, 아래는 같은 색의 빈 셀. 시간표에 1시간 수업 + 색만 있는 빈 칸으로 분리되어 표시.

**Pass 1 (top-down 흡수)** — 빈 텍스트 + 위 셀과 같은 배경색이면 위 셀의 연속(`isMergedContinuation`)으로 처리하고 위 셀의 `rowSpan`을 늘림.

### 2. 텍스트가 가운데/아래 셀에 위치

강의명을 첫 셀이 아닌 가운데/아래 셀에 입력. Pass 1만으론 텍스트 위쪽 빈 셀이 단독으로 남음.

**Pass 2 (bottom-up 끌어올림)** — 앵커 셀의 위가 같은 색·빈 텍스트면 title/subtitle을 위로 lift. bottom-up 방향이라 여러 칸 빈 셀도 cascade로 한 번에 처리.

### 3. 흰색이 카테고리 색

`자율` 같은 흰색 카테고리가 있어 매니저가 흰색으로 칠해도, `toHexColor`(`lib/color.ts`)가 시트 기본값(배경 미설정)도 `#ffffff`로 채우기 때문에 둘을 구분할 수 없음. 무관한 흰 셀끼리 잘못 병합될 위험.

**`isNoBgColor` 가드** — 흰색 근사값(`#ffffff` 채널당 ±2 이내)은 두 패스 모두 보정 제외. 매니저가 색을 비워둔 의도를 존중하고, 흰색 카테고리는 명시적 Excel 병합으로 보충하도록 위임.

### 4. 같은 색에 1단계 다른 음영 사용

5회차 2주차 7/28(화) `(김해대)` 케이스에서 발견. 한 셀만 `#d9d9d9`, 나머지는 `#d8d8d8` (`0.8470588 = 216/255` vs `0.8509804 = 217/255`). 시각적으론 동일하지만 정확 비교에선 다른 색으로 판정 → 블록 일부만 병합.

**`isCloseColor` (±2/255 tolerance)** — 채널당 ±2 이내 차이는 같은 색 취급. 시각적으로 구분 안 되는 수준만 흡수, 실제 다른 카테고리는 영향 없음.

---

## Pass 순서가 중요하다 — Pass 1 → Pass 2 필수

거꾸로 돌리면 인접한 두 강의가 잘못 병합됨.

```
행0: "컴퓨터" 파랑       의도: 컴퓨터(0~1) + 영상(2~3)
행1: 빈        파랑
행2: "영상"   파랑
행3: 빈        파랑
```

Pass 1이 먼저 r=1을 "컴퓨터의 연속", r=3을 "영상의 연속"으로 `isMergedContinuation` 마킹. Pass 2는 이 마킹을 boundary로 삼아 `if (above.isMergedContinuation) continue` 가드로 lift 차단 → 분리 유지.

순서가 바뀌면 Pass 2가 먼저 r=1을 "영상의 lift 대상"으로 잡아 옮겨버림. 컴퓨터의 두 번째 시간을 영상이 빼앗음.

---

## 핵심 가드 요약

```ts
// Pass 1: 빈 셀이 위 텍스트 셀의 연속으로 흡수
if (cur.isMergedContinuation || cur.title) continue
if (!top.title) continue
if (isNoBgColor(cur.bgColor) || !isCloseColor(cur.bgColor, top.bgColor)) continue
top.rowSpan = (r - topR) + cur.rowSpan
cur.isMergedContinuation = true

// Pass 2: 앵커 title이 같은 색 빈 위 셀로 끌어올림
if (cur.isMergedContinuation || !cur.title) continue
if (above.title || above.isMergedContinuation) continue
if (isNoBgColor(cur.bgColor) || !isCloseColor(cur.bgColor, above.bgColor)) continue
above.title = cur.title; above.subtitle = cur.subtitle
above.rowSpan = cur.rowSpan + 1
cur → 빈 텍스트 + isMergedContinuation
```

흡수 범위 계산 시 `cur.rowSpan`까지 합산해야 cur가 명시적 merge 시작점일 때 길이가 누락되지 않음.

---

## 구현 중 발견한 빈틈

**위 셀 title 가드 누락 시 빈 셀끼리 묶이는 버그** — 첫 시도엔 `if (!top.title) continue`가 없어 매니저 시트의 진짜 빈 슬롯들이 세로로 묶여 한 칸이 길게 그려짐. 원인은 `toHexColor`가 배경 미설정 셀에 `#ffffff`를 채워줘 빈 셀끼리도 같은 색으로 인식됨. "위 셀이 진짜 수업(title 존재)이어야 함" 가드 + `isNoBgColor`로 해결.

---

## 한계

- `COLOR_TOLERANCE`(±2/255) 초과의 음영 차이는 다른 색으로 판정 — 매니저가 더 다른 색을 섞으면 자동 보정 불가, 시트 정리 필요.
- 흰색 카테고리 셀은 자동 병합 대상에서 제외 — 명시적 Excel 병합으로 보충해야 함.
- 한 블록에 두 개 이상 title이 적힌 경우(예: 첫 행 강의명 + 둘째 행 부제 텍스트가 별도 셀)는 Pass 2의 `above.title` 가드에 막혀 별도 처리 필요. 색이 같으면 색 tolerance로 일부 흡수되지만, 두 title이 한 블록임을 추론하는 별도 규칙은 미구현.
