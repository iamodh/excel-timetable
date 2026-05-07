# 그리드 rowSpan 모델 — 명시 merge와 색 기반 보정의 데이터 표현

시간표 그리드는 셀 단위 슬롯의 2차원 배열로 표현된다. 병합된 블록은 두 개의 필드로 표현된다 — 앵커 셀의 `rowSpan`과 나머지 셀들의 `isMergedContinuation` 플래그. 이 모델 위에서 두 단계 보정이 순차적으로 일어난다.

---

## 1. Slot 구조

```ts
interface Slot {
  startTime: string
  endTime: string
  title: string
  subtitle: string | null
  bgColor: string
  textColor: string
  rowSpan: number
  isMergedContinuation: boolean
}
```

`rowSpan`/`isMergedContinuation`은 HTML `<td rowspan>`과 동일한 의미다. 한 블록에 한 명의 앵커 셀이 있고:

- 앵커 셀: `title` 있음, `rowSpan ≥ 1`, `isMergedContinuation = false`
- 흡수된 셀: `title` 빔, `rowSpan = 1`, `isMergedContinuation = true`

렌더 시점엔 `isMergedContinuation = true`인 셀을 `<td>` 출력에서 건너뛰고, 앵커 셀의 `rowSpan` 값으로 세로 길이를 늘린다.

---

## 2. parseGridSlots — 초기 상태

`parseGridSlots`는 시트의 RowData를 순회하며 모든 셀을 독립 슬롯으로 만든다. 이 단계에선 병합 정보가 반영되지 않는다.

```ts
return {
  // ... title, subtitle, bgColor 등
  rowSpan: 1,
  isMergedContinuation: false,
}
```

모든 셀이 `rowSpan: 1`, `isMergedContinuation: false`로 시작한다.

---

## 3. applyMerges — 명시 merge 반영

Google Sheets API는 명시 병합을 `merges` 배열로 별도 반환한다.

```ts
{ startRowIndex, endRowIndex, startColumnIndex, endColumnIndex }
```

병합된 셀의 값은 **왼쪽 위 셀에만 저장**되고 나머지 셀은 빈 값으로 온다. 그래서 `applyMerges`는 merges 배열을 보고 슬롯 그리드에 직접 마킹한다.

```ts
export function applyMerges(slots: MergeableSlot[][], merges: MergeRange[]): void {
  for (const merge of merges) {
    const span = merge.endRowIndex - merge.startRowIndex
    if (span > 1) {
      slots[merge.startRowIndex][merge.startColumnIndex].rowSpan = span
      for (let r = merge.startRowIndex + 1; r < merge.endRowIndex; r++) {
        slots[r][merge.startColumnIndex].isMergedContinuation = true
      }
    }
  }
}
```

세로 병합(`span > 1`)만 처리한다. 가로 병합은 이 그리드 모델에서 다루지 않는다.

이 단계 이후, **명시 merge로 표현된 블록은 정확히 표시된다**. 매니저가 색만 칠하고 명시 병합을 빠뜨린 블록은 아직 분리된 상태로 남는다.

---

## 4. applyImplicitMerges — 색 기반 보정

`applyMerges` 직후에 호출된다. 이 단계는 `applyMerges`가 만든 마킹을 전제로 동작한다.

### 입력 가정

- 진짜 명시 merge 블록은 이미 `rowSpan` + `isMergedContinuation`으로 표시됨.
- 매니저가 색만 칠한 블록은 분리된 슬롯들로 남아있고, 각 슬롯이 `bgColor`를 들고 있음.

### 두 패스의 역할

**Pass 1 — 위 셀 찾아 흡수.** 각 빈 셀이 자기 위쪽 같은 색 타이틀 셀을 찾아 그 연속(`isMergedContinuation`)으로 마킹한다.

```ts
let topR = r - 1
while (topR > 0 && slots[topR][c].isMergedContinuation) topR--
```

위쪽으로 거슬러 올라가면서 `isMergedContinuation` 표시된 셀들을 건너뛰고 진짜 앵커를 찾는다. 그 앵커가 `title`을 가진 셀이어야 흡수 진행. 빈 셀끼리 묶이는 것을 막는 가드.

**흡수 범위 계산:**

```ts
top.rowSpan = (r - topR) + cur.rowSpan
```

`cur.rowSpan`까지 합산해야 cur가 다른 명시 merge의 시작점일 때 그 길이가 누락되지 않는다.

**Pass 2 — 타이틀 끌어올리기.** 타이틀이 가운데/아래에 있는 케이스를 처리한다. bottom-up으로 순회하며 title이 있는 셀을 발견하면 위 셀로 lift한다.

```ts
above.title = cur.title
above.subtitle = cur.subtitle
above.rowSpan = cur.rowSpan + 1
cur.title = ""
cur.subtitle = null
cur.isMergedContinuation = true
cur.rowSpan = 1
```

bottom-up이라 cascade가 자연스럽게 일어난다. 첫 iteration에서 r → r-1로 옮기고, 다음 iteration에서 r-1을 처리할 때 r-2로 또 옮길 수 있다.

---

## 5. Pass 순서가 강제되는 이유

Pass 1이 만든 `isMergedContinuation` 마킹이 Pass 2의 boundary 역할을 한다.

```ts
if (above.title || above.isMergedContinuation) continue
```

Pass 2는 위 셀이 이미 다른 블록의 연속으로 마킹돼 있으면 lift를 중단한다. 인접한 두 블록이 같은 색일 때 잘못 합쳐지는 걸 막는 가드.

```
행0: "컴퓨터" 파랑       의도: 컴퓨터(0~1) + 영상(2~3)
행1: 빈        파랑
행2: "영상"   파랑
행3: 빈        파랑
```

순서대로 돌리면:
- Pass 1 후: r=1과 r=3이 각자 위 앵커의 연속으로 마킹.
- Pass 2: 영상(r=2)을 r=1로 끌어올리려 하지만 `r=1.isMergedContinuation = true` → 중단. 분리 유지.

순서를 뒤집으면:
- Pass 2 먼저: 영상(r=2)이 r=1로 lift됨. 컴퓨터의 두 번째 시간을 영상이 빼앗음.
- Pass 1 나중: 이미 깨진 상태에서 추가 흡수만 일어남.

따라서 Pass 1 → Pass 2가 강제된다.

---

## 6. 호출 순서 정리

```
parseGridSlots(rowData)              // 모든 셀 독립 슬롯, rowSpan=1
  ↓
applyMerges(slots, merges)            // 명시 merge 반영
  ↓
applyImplicitMerges(slots)            // 색 기반 보정 (Pass 1 → Pass 2)
  ↓
렌더 시 isMergedContinuation=true 슬롯은 <td> 출력에서 건너뜀
```

각 단계는 in-place 수정이다. 세 단계 모두 같은 `slots` 배열을 변형한다.
