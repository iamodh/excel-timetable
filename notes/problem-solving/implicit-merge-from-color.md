# 매니저가 빠뜨린 세로 병합을 색상으로 추론

M17 작업 중 발견. 2회차 1주차 화요일 "명상을 통한 활력 충전"이 원래 2시간(2칸 세로 병합)이지만 매니저가 병합을 빠뜨리고 두 칸 모두 같은 색만 칠한 상태로 저장 → 시간표에 1시간 수업 + 색만 있는 빈 칸으로 표시됨.

---

## 검토한 방안

1. **색이 같으면 병합** — 같은 카테고리 연속 수업을 구분 못 함 (탈락)
2. **빈 셀이면 위 수업의 연속** — "13~17시 사이에 진짜 빈 시간 없음" 전제에 의존 (탈락)
3. **빈 텍스트 + 위 셀과 같은 배경색** — 두 신호의 교집합으로 1·2의 단점 모두 해소 (채택)

매니저 시트 규약 확인: 빈 시간은 텍스트도 색도 없는 흰색 셀, 색만 있고 텍스트 비어있는 정당한 케이스 없음 → 방안 3이 안전.

## 해결 방법

`applyImplicitMerges`(`lib/parser.ts`) 신규 — `applyMerges` 다음 단계에서 슬롯 그리드를 한 번 더 순회하며 가상 merge 적용. 렌더러는 기존 `rowSpan` / `isMergedContinuation` 경로를 그대로 사용하므로 UI 수정 불필요.

```ts
if (cur.isMergedContinuation || cur.title) continue
let topR = r - 1
while (topR > 0 && slots[topR][c].isMergedContinuation) topR--
const top = slots[topR][c]
if (!top.title) continue
if (!cur.bgColor || cur.bgColor !== top.bgColor) continue
top.rowSpan = (r - topR) + cur.rowSpan
cur.isMergedContinuation = true
```

가드 세 개:
- 현재 셀: 빈 텍스트 + 명시적 merge continuation 아님
- 위 셀(merge 시작점이면 시작점까지 거슬러 올라감): **title 있어야 함** — "진짜 수업의 연속"임을 보장
- 현재 셀의 배경색이 위 셀과 동일

흡수 범위는 `cur.rowSpan`을 더해 계산 — cur가 명시적 merge 시작점이면 그 길이까지 함께 흡수한다.

## 구현 중 발견한 두 가지 빈틈

**1. 빈 셀끼리 묶이던 버그** — 첫 시도는 위 셀 title 가드(`if (!top.title) continue`)가 없었고, 매니저 시트의 진짜 빈 슬롯들이 세로로 묶여 한 칸이 길게 그려지는 현상 발생. 원인은 `toHexColor`가 시트 셀에 `backgroundColor`가 없을 때 기본 `#ffffff`로 채워줌(`lib/color.ts:2`) → 빈 칸끼리도 같은 흰색으로 인식되어 가상 merge 대상이 됨. "위 셀이 진짜 수업(title 존재)이어야 함" 가드 추가로 해결.

**2. 명시적 merge 시작점을 흡수할 때 길이 누락** — "13:00 단일 셀 + 14:00~17:00 명시적 병합"처럼 매니저가 한 수업을 두 단위로 나눈 케이스에서, 첫 흡수식이 `top.rowSpan = r - topR + 1`이라 1행만 합산. 14:00 셀의 명시적 `rowSpan=3`이 무시되어 13:00 셀이 2시간으로만 그려짐. `+ cur.rowSpan`으로 바꿔 흡수 대상의 길이까지 합산하도록 수정.

## 한계

- 카테고리 색이 흰색(`#ffffff`)인 수업이 시트에 흰색+텍스트로 칠해져 있고 다음 칸이 빈 흰색이면 자동 병합됨 — 색 비교는 흰색 여부와 무관하게 동일성만 본다. 운영 중 문제되면 별도 가드 검토.
- 요일 헤더 행은 `parseGridSlots`에 들어가지 않으므로 첫 시간 슬롯이 헤더와 묶일 우려 없음 (`parseTimetable`이 `weekBlock.slice(1)`로 헤더 분리).
