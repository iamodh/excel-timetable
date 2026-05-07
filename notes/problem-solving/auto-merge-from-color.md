# 색 기반 자동 병합 — 매니저 색칠 실수 보정

## 문제 상황

매니저가 시간표 셀을 색으로만 표시하고 명시적 Excel 병합을 빠뜨리는 패턴이 반복적으로 발견됨. 시각적으론 한 블록(예: 3시간 강의)이지만 시트 데이터로는 분리돼 있어 UI가 1시간 짜리 + 색만 있는 빈 칸들로 잘게 쪼개져 표시됐다.

발견된 4가지 변형 패턴:

1. **세로 병합 누락** — 첫 셀에 강의명, 아래는 같은 색의 빈 셀 (Excel merge 없음)
2. **텍스트가 가운데/아래에 위치** — 강의명을 첫 셀이 아닌 가운데/아래 셀에 입력
3. **흰색 카테고리** — `자율` 같은 흰색 카테고리를 매니저가 흰색으로 칠하면, 배경색이 비어있는 셀과 구분 불가능
4. **같은 색에 1단계 다른 음영** — 한 셀만 `#d9d9d9`, 나머지는 `#d8d8d8` 같이 채널값이 1 차이. 시각적으론 동일한데 정확 비교에선 다른 색으로 판정 → 블록 일부만 병합

## 원인

- Google Sheets API의 색상 데이터에서 "배경 미설정" 셀과 "명시적 흰색" 셀이 모두 `#ffffff`로 정규화되어 구분 불가능.
- 매니저가 색을 칠할 때 picker에서 1단계 다른 음영을 섞어 쓰는 일이 잦음.
- 강의명을 어느 행에 적느냐가 매니저마다 다름 — 첫 행에 적기도 하고 가운데/마지막 행에 적기도 함.
- Excel merge 정보만 보고 파싱하면 이 분리된 셀들이 각자 독립 슬롯으로 처리됨.

## 해결 방법

`lib/parser.ts`의 `applyImplicitMerges`가 `applyMerges`(명시 merge 적용) 직후에 한 번 더 그리드를 순회하며 색 기반으로 보정한다. 두 개의 pass로 구성된다.

### Pass 1 — 위 셀 찾아 흡수 (탐색 방향 아래→위)

각 셀이 자신의 위쪽 같은 색 타이틀 셀을 찾아 그 연속(`isMergedContinuation`)으로 마킹한다. 위 셀의 `rowSpan`이 늘어난다. 이미 다른 병합의 연속으로 마킹된 셀은 건너뛰고 더 위의 진짜 앵커를 찾는다.

```ts
for (let c = 0; c < cols; c++) {
  for (let r = 1; r < slots.length; r++) {
    const cur = slots[r][c]
    if (cur.isMergedContinuation || cur.title) continue
    let topR = r - 1
    while (topR > 0 && slots[topR][c].isMergedContinuation) topR--
    const top = slots[topR][c]
    if (!top.title) continue
    if (isNoBgColor(cur.bgColor) || !isCloseColor(cur.bgColor, top.bgColor)) continue
    top.rowSpan = (r - topR) + cur.rowSpan
    cur.isMergedContinuation = true
  }
}
```

이 단계로 패턴 1이 해소된다.

### Pass 2 — 타이틀 끌어올리기

bottom-up으로 순회하며 타이틀을 가진 셀을 발견하면, 그 위 셀이 같은 색 + 빈 텍스트면 title/subtitle을 위로 lift한다. bottom-up 방향이라 여러 칸 빈 셀도 cascade로 한 번에 처리된다.

```ts
for (let c = 0; c < cols; c++) {
  for (let r = slots.length - 1; r >= 1; r--) {
    const cur = slots[r][c]
    if (cur.isMergedContinuation || !cur.title) continue
    const above = slots[r - 1][c]
    if (above.title || above.isMergedContinuation) continue
    if (isNoBgColor(cur.bgColor) || !isCloseColor(cur.bgColor, above.bgColor)) continue
    above.title = cur.title
    above.subtitle = cur.subtitle
    above.rowSpan = cur.rowSpan + 1
    cur.title = ""
    cur.subtitle = null
    cur.isMergedContinuation = true
    cur.rowSpan = 1
  }
}
```

이 단계로 패턴 2가 해소된다.

### 두 가드

- `isNoBgColor(color)` — 흰색 근사값(`#ffffff` ±2/255)은 두 패스 모두 보정 제외. 매니저가 색을 비워둔 의도를 존중하고, 흰색 카테고리는 명시적 Excel 병합으로 보충하도록 위임. 패턴 3 대응.
- `isCloseColor(a, b)` — RGB 채널당 ±2 이내 차이는 같은 색 취급. 시각적으로 구분 안 되는 수준만 흡수. 패턴 4 대응.

### Pass 순서가 중요 — Pass 1 → Pass 2 필수

거꾸로 돌리면 인접한 두 강의가 잘못 병합된다.

```
행0: "컴퓨터" 파랑       의도: 컴퓨터(0~1) + 영상(2~3)
행1: 빈        파랑
행2: "영상"   파랑
행3: 빈        파랑
```

- Pass 1이 먼저 r=1을 "컴퓨터의 연속", r=3을 "영상의 연속"으로 `isMergedContinuation` 마킹.
- Pass 2는 이 마킹을 boundary로 삼는다 (`if (above.isMergedContinuation) continue`). 영상의 title이 r=1로 lift되지 않음 → 분리 유지.

순서가 바뀌면 Pass 2가 먼저 r=1을 "영상의 lift 대상"으로 잡아 옮겨버려 컴퓨터의 두 번째 시간을 영상이 빼앗는다.

## 결과

- 4가지 패턴 모두 자동 보정. 매니저가 시각적으로 한 블록처럼 칠한 영역은 UI에서도 한 블록으로 표시된다.
- 매니저가 명시 병합을 일관되게 안 해도 시간표가 깨지지 않는다.
- 한계:
  - `COLOR_TOLERANCE`(±2/255) 초과의 음영 차이는 다른 색으로 판정 — 매니저가 더 다른 색을 섞으면 자동 보정 불가, 시트 정리 필요.
  - 흰색 카테고리 셀은 자동 병합 대상에서 제외 — 명시적 Excel 병합으로 보충해야 함.
  - 한 블록에 두 개 이상 title이 적힌 경우(예: 첫 행 강의명 + 둘째 행 부제 텍스트가 별도 셀)는 Pass 2의 `above.title` 가드에 막혀 별도 처리 필요.
