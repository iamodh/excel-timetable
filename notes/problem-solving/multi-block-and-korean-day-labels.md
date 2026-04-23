# 새 시트 연동 시 카테고리 중복 + 시간표 미렌더 문제

## 발견한 현상

구글 시트에 새 학기 시간표를 삽입한 뒤 웹에서:

1. **카테고리 범례가 중복 표시** — 같은 카테고리(밀착상담, 사례관리 등)가 두 번씩 나옴
2. **주차별 시간표가 아예 렌더 안 됨** — 빈 화면

콘솔에 에러/스택 트레이스는 없음. 둘 다 **조용히 실패**하는 형태.

## 전제: 새 시트의 두 가지 구조 변화

디버그 API 라우트(`GET /api/debug/sheet`)로 원본 `rowData`를 찍어보고 확인한 사실:

1. **블록이 가로로 2개 배치돼 있음** — 1회차(col 0~5) / 구분열(col 6) / 2회차(col 7~12). 한 블록 = 6열.
2. **요일 라벨이 한글** — `4/7(화)`, `4/8(수)` 형식. 이전 테스트는 `4/7(Tue)` 영문 기준으로 작성돼 있었음.

이전 시트가 단일 블록 + 영문 요일이었던 걸 암묵적으로 가정한 코드·테스트가 그대로 남아 있던 상황.

---

## 원인 1: `parseTimetable`을 전체 시트에 호출

`lib/sheets.ts`의 `extractFirstTabSessions`가 시트 전체 `rowData`를 통째로 `parseTimetable`에 넘기고 있었다.

```ts
// Before
return [parseTimetable(rowData, merges)]
```

그런데 `parseTimetable`은 **단일 블록(6열)** 기준으로 설계된 함수다. 전체 시트(13+열)를 주면 내부의 `parseCategories(rowData.slice(0, 2))`가 모든 열을 훑으면서 **각 블록의 범례를 다 긁어모은다**. 블록 수만큼 같은 카테고리가 배열에 중복 push되어 UI에 중복 표시.

블록 분리 함수(`parseSessionBlocks`)는 이미 구현돼 있고 테스트도 있었지만(`parser.test.ts:205`), **아무도 부르지 않는 상태**였다. M16에서 도입됐는데 호출부 전환이 누락된 것으로 추정.

### 해결

`extractFirstTabSessions`가 `parseSessionBlocks`를 호출하도록 교체:

```ts
// After (lib/sheets.ts)
return parseSessionBlocks(rowData, merges)
```

`parseSessionBlocks`는 7열 stride(6열 + 구분 1열)로 블록을 자른 뒤 각 블록마다 `parseTimetable`을 따로 호출한다. 단일 블록 시트에서도 안전 — 두 번째 반복에서 `programName`이 빈 값이면 break하여 길이 1 배열 반환.

`sheets.test.ts`의 단일 블록 케이스는 그대로 통과. 블록 분리 시나리오는 `parser.test.ts`가 이미 커버하고 있어서 상위 레이어 테스트는 추가하지 않음.

---

## 원인 2: `parseWeekHeader`의 `\w` 정규식이 한글 비매칭

요일 라벨을 파싱하던 정규식:

```ts
// Before (lib/parser.ts)
const match = val.match(/^(.+)\((\w+)\)$/)
```

JS에서 `\w`는 기본 `[A-Za-z0-9_]` — **ASCII 전용**이다. `(화)`, `(수)` 등 한글은 매칭 실패.

실패 시 `days.push`가 호출되지 않아 `days = []`. `parseTimetable`은 이 빈 배열을 받아 week 객체를 만들지만, 내부 요일/슬롯이 없으니 **UI에 렌더할 게 0개**. 이게 "시간표가 안 보인다"의 정체.

### 왜 throw가 아니라 조용한 실패였나

- `parseWeekHeader`는 매칭 실패 시 `continue`로 넘어갈 뿐 예외를 던지지 않는다.
- `determineCurrentSession`은 `day.date` 없으면 `getSessionRange`가 `null`을 반환하고 그냥 다음 세션으로 넘어간다. 모든 세션이 그러면 `return 0`.
- `filterVisibleSessions`의 `parsePeriodStart`는 `/(\d{4})\.(\d{1,2})\.(\d{1,2})/`라 `[...]` 대괄호 포함 여부와 무관하게 숫자만 추출 → 정상 동작.

즉 파이프라인 어디에도 방어적 throw가 없어서, 전부 "빈 데이터를 끝까지 통과시킨" 결과.

### 해결

정규식 한 글자 수정:

```ts
// After (lib/parser.ts)
const match = val.match(/^(.+)\(([^)]+)\)$/)
```

`\w+` → `[^)]+`("닫는 괄호 외 아무 문자"). 한글/영문/기타 문자 모두 포괄. 유니코드 속성(`\p{L}` + `u` 플래그)도 검토했으나 오버엔지니어링이라 보고 가장 단순한 옵션 선택.

테스트(`parser.test.ts:107`)도 실제 시트 포맷을 반영해 영문 라벨 → 한글 라벨로 교체.

---

## 삽질 포인트: 수정 후에도 UI가 그대로였음

정규식 고쳐도 브라우저에서 변화 없었다. 원인은 `lib/sheets.ts`의 `getAllTimetableData`에 걸린 `"use cache"` + `cacheTag("timetable")`.

- 캐시되는 값이 "구글 시트 원본 데이터"가 아니라 **파서를 거친 최종 결과** 그 자체.
- 수정 전 첫 로드에서 이미 "빈 days" 결과가 캐시에 저장돼 있었고, 파서 코드가 핫리로드돼도 캐시된 **반환값**은 그대로 재사용됨.
- `npm run dev` 재시작(또는 `revalidateTag("timetable", "max")` 호출)으로 캐시를 날려야 반영.

교훈: **파서/트랜스포머 로직을 바꿀 때는 그 결과를 캐시하는 경로가 있는지 먼저 확인**하고, 검증 전에 한 번 무효화해두는 게 삽질 방지. `use-cache-and-tags.md` 참조.

---

## 한 줄 요약

"가로 다중 블록" + "한글 요일 라벨" 두 조건이 새 시트에서 동시에 등장했고, 기존 파서는 둘 다 처리 못 했다. 호출 함수 교체(`parseTimetable` → `parseSessionBlocks`)로 범례 중복을, 정규식 한 글자 수정(`\w+` → `[^)]+`)으로 시간표 미렌더를 해결. 검증 시에는 `"use cache"` 무효화 필요.
