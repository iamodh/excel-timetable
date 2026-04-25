# 매니저 실제 시트 연동 시 발견한 두 가지 파싱 버그

M17 작업 중 매니저 실제 시트(`장기1기 - 1~5회차`, 회차당 5주차)와 연결하면서 드러난 문제들.

---

## 1. 시트의 빈 첫 행/첫 열 패딩

### 문제 상황

매니저 시트는 의도된 미관 규약으로 **행 1과 열 A를 빈 패딩**으로 둔다. 즉 실제 데이터는 행 2 / 열 B부터 시작.

기존 파서는 행 0 = 범례, 열 0 = 시간 라벨 가정으로 동작 → 매니저 시트 그대로 넘기면 헤더/그리드 인덱스가 한 칸씩 어긋나 `parseSessionBlocks`가 `programName`을 못 찾고 빈 배열 반환 → `SessionTabs`에서 `data.categories` 접근 시 TypeError.

### 해결 방법

파서의 입력 가정은 그대로 두고, 시트 어댑터(`lib/sheets.ts`의 `extractFirstTabSessions`)가 첫 행 + 첫 열을 떼어낸 뒤 `parseSessionBlocks`에 넘기도록.

```ts
const rowData = allRows.slice(1).map((row) => ({
  ...row,
  values: (row.values ?? []).slice(1),
}))
const merges = allMerges
  .filter((m) => m.startRowIndex >= 1 && m.startColumnIndex >= 1)
  .map((m) => ({
    ...m,
    startRowIndex: m.startRowIndex - 1,
    endRowIndex: m.endRowIndex - 1,
    startColumnIndex: m.startColumnIndex - 1,
    endColumnIndex: m.endColumnIndex - 1,
  }))
```

`merges`도 행/열 인덱스 -1 보정. 첫 행/열에 걸친 병합은 매니저 규약상 없으므로 `filter`로 가드.

### 효과

- 파서는 "행 0 = 범례, 열 0 = 시간 라벨"이라는 단순한 가정을 유지
- 시트 특수성(빈 패딩)은 어댑터 한 곳에서 흡수
- `sheets.test.ts`의 mock에 빈 첫 행/열을 추가해 새 레이아웃 검증 — 기존 "첫 번째 탭만 사용" 검증과 한 케이스에 통합

---

## 2. 그리드 끝을 감지하지 못해 빈 행을 weekHeader로 오인

### 문제 상황

매니저 시트는 회차당 정확히 5주차(45행)지만, Google Sheets API는 시트 기본 ~1000행을 통째로 반환. `parseTimetable`의 루프가 길이만 보고 9행 단위로 ~110번 반복:

```ts
for (let i = 0; i + WEEK_ROWS <= gridRows.length; i += WEEK_ROWS) {
  const weekHeader = parseWeekHeader(weekBlock[0])
  weeks.push({ weekNumber: weekHeader.weekNumber, days })
}
```

`parseWeekHeader`는 라벨이 빈 셀이면 `parseInt("")` = NaN → `|| 1` fallback으로 weekNumber=1을 반환 → 5주차 다음부터 weekNumber=1인 가짜 weeks가 100여 개 추가 → React 중복 key 경고("Encountered two children with the same key, `1`").

가짜 weeks는 days=[]라 시각적으로 거의 보이지 않았지만, DOM에는 빈 컨테이너 100여 개가 마운트됨. 회차 탭 전환 시 reconciliation 오작동이 잠재적으로 가능했음.

### 해결 방법

`parseTimetable`이 weekBlock 첫 셀의 라벨이 `N주차` 패턴이 아니면 그리드 끝으로 보고 `break`:

```ts
for (let i = 0; i + WEEK_ROWS <= gridRows.length; i += WEEK_ROWS) {
  const weekBlock = gridRows.slice(i, i + WEEK_ROWS)
  const weekLabel = weekBlock[0]?.values?.[0]?.formattedValue ?? ""
  if (!/\d+\s*주차/.test(weekLabel)) break
  // ... 기존 처리
}
```

### 효과

- 5주차 다음 빈 행을 만나는 즉시 종료 → weeks 배열 정확히 5개
- React 중복 key 경고 사라짐, DOM에 가짜 컨테이너 생성 없음
- `parser.test.ts`에 그리드 영역 뒤에 빈 행/노이즈 행이 있어도 weeks가 정확히 종료되는 케이스 추가

---

## 디버깅 메모

- 두 버그 모두 **조용히 실패** — 캐시된 결과가 SSR에서 빈 데이터로 통과되거나, React 경고만 나오고 시각적 흔적이 거의 없어 원인 추적이 까다로웠음
- 어댑터 통과 후 `rowData`의 첫 컬럼을 `console.log`로 행별 출력하는 일회성 디버그 라인이 가장 빠른 진단 도구였음
- 캐싱 영향: `getAllTimetableData`의 `"use cache"`로 파서 결과가 캐시되므로, 파서 수정 후에는 dev 서버 재시작이 필요. `use-cache-and-tags.md` 참조
