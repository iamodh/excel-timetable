# 캐시 미스 시 Sheets API 응답이 ~10초로 느린 문제

## 문제 상황

`/` 첫 로딩이 학생 체감으로 매우 길다. Cache Components 모델 + `unstable_cache`로 정적 셸과 데이터 캐시는 분리되어 있어 캐시 히트 시에는 ~870ms로 정상 동작하지만, 캐시 무효화 직후 첫 학생은 ~10초간 스피너만 본다.

Lighthouse 결과:

```
Performance      90  (오해를 부르는 숫자 — TBT/CLS가 끌어올림)
LCP              10.46s  (Unscored)
Speed Index      6.1s
TTFB             10ms     ← 셸은 즉시 옴
Element render delay  10,460ms   ← 동적 홀이 스트리밍될 때까지 대기
```

## 원인 분석

병목 지점을 좁히기 위해 `getAllTimetableData()`(`lib/sheets.ts`)에 단계별 타이머를 추가:

```ts
const t0 = Date.now()
const spreadsheet = await fetchTimetableData()
const tAfterFetch = Date.now()
console.log(`[sheets] fetch ${tAfterFetch - t0}ms`)
const sessions = extractFirstTabSessions(spreadsheet)
console.log(`[sheets] parse ${Date.now() - tAfterFetch}ms`)
console.log(`[sheets] total ${Date.now() - t0}ms`)
```

서버 로그:

```
[sheets] fetch 9996ms     ← Sheets API 호출
[sheets] parse 1ms         ← parseSessionBlocks
[sheets] total 9997ms
```

**fetch가 99.99%**, parse는 무시 가능. 즉 React 렌더, RSC payload 직렬화, Redis 조회, parser 어느 것도 병목이 아니고 **Google Sheets API 응답 자체가 ~10초**다.

원인은 `lib/sheets.ts`의 fetch 옵션:

```ts
const response = await sheets.spreadsheets.get({
  spreadsheetId: sheetId,
  includeGridData: true,   // ← 매니저 시트 전체 셀 + 포맷 끌어옴
})
```

`includeGridData: true`는 모든 셀의 값, 색상, 포맷, 병합 등 grid 데이터 전체를 반환한다. 매니저 시트는 빈 행/열을 포함해 수천 셀에 포맷이 깔려 있고 응답이 수 MB 단위가 된다. 이전 incident note(`use-cache-not-shared-on-vercel.md`)에서 ~6초로 측정됐던 게 시트 확장으로 ~10초까지 늘어났다 — 시간이 갈수록 악화될 작업.

## 측정 방법

이후 개선 작업의 before/after 비교를 위해 반복 가능한 측정 워크플로우:

### 1. 서버 측 단계별 시간 (Vercel 로그)

`getAllTimetableData()`에 fetch/parse/total 타이머가 박혀 있다. Vercel 함수 로그 또는 `vercel logs`에서 `[sheets]` 패턴으로 필터.

- 로그가 찍힌 요청 = 캐시 미스
- 로그가 없는 요청 = 캐시 히트

### 2. 강제 캐시 미스 만들기

서버 Data Cache는 브라우저에서 못 비우므로, `/api/revalidate`로 강제 무효화:

```bash
URL=https://excel-timetable.vercel.app
TOKEN=<ADMIN_PASSWORD 값>

curl -X POST "$URL/api/revalidate" \
  -H "Cookie: admin_token=$TOKEN"
```

`revalidateTag("timetable", "max")`가 호출되어 다음 요청이 cache fill을 부담.

### 3. Lighthouse 측정

무효화 직후 즉시 실행:

```bash
npx lighthouse "$URL/" \
  --output html \
  --output-path ./lh-cache-miss.html \
  --chrome-flags="--headless" \
  --only-categories=performance
```

DevTools 패널로 측정할 경우, `/admin` 로그인 후 콘솔에서 `await fetch('/api/revalidate', { method: 'POST' })`로 무효화하고 Lighthouse 패널에서 "Clear storage"는 체크 해제(쿠키 보존)한 채로 실행.

## 개선 전 지표 (baseline)

| 구분 | 값 |
|------|-----|
| Sheets API fetch | 9,996 ms |
| parseSessionBlocks | 1 ms |
| getAllTimetableData total | 9,997 ms |
| Lighthouse Performance | 90 |
| LCP | 10.46s (Unscored) |
| Speed Index | 6.1s |
| TTFB | 10 ms |
| Element render delay | 10,460 ms |

## 해결 방법

`sheets.spreadsheets.get`의 `includeGridData: true`를 **`fields` 마스크**로 교체. parser가 실제로 읽는 4가지 경로만 응답에 포함시켜 셀당 페이로드를 좁힘.

```ts
// before
const response = await sheets.spreadsheets.get({
  spreadsheetId: sheetId,
  includeGridData: true,
})

// after
const response = await sheets.spreadsheets.get({
  spreadsheetId: sheetId,
  fields:
    "sheets(data(rowData(values(formattedValue,effectiveFormat(backgroundColor,textFormat(foregroundColor))))),merges)",
})
```

parser와 1:1 매핑:

| 마스크 경로 | parser에서 읽는 곳 |
|-------------|--------------------|
| `formattedValue` | `cell.formattedValue` (parseCategories, parseHeader, parseWeekHeader, parseGridSlots) |
| `effectiveFormat.backgroundColor` | `toHexColor(cell.effectiveFormat?.backgroundColor)` (parseCategories, parseGridSlots, applyImplicitMerges) |
| `effectiveFormat.textFormat.foregroundColor` | `toTextColor(cell.effectiveFormat?.textFormat?.foregroundColor)` (parseGridSlots) |
| `merges` | `firstTab.merges` (extractFirstTabSessions → parseSessionBlocks → applyMerges) |

마스크에 빠진 경로(`userEnteredValue`, `note`, `hyperlink`, `effectiveFormat.padding`, `borders`, `textFormatRuns`, `horizontalAlignment` 등)가 빈 셀에서도 기본값을 ~500바이트씩 끌어왔던 게 핵심 병목이었음. 1000행 × 26열 기본 그리드에서 빈 셀 ~24,000개 × 500바이트 ≈ 12 MB가 "아무것도 없는 영역의 기본 포맷"으로만 흐르고 있었던 것.

향후 parser가 새 필드를 읽기 시작하면 이 마스크도 함께 늘어나야 함 — 마스크에 없는 필드는 `undefined`로 와서 조용히 깨질 수 있음.

## 결과

배포 환경, 모바일 시뮬레이션, cache miss 강제 후 측정.

| 지표 | Before (`includeGridData`) | After (`fields` 마스크) | 변화 |
|------|---------------------------|------------------------|------|
| `[sheets] fetch` | 9,996 ms | **3,397 ms** | **-66%** |
| `[sheets] parse` | 1 ms | 15 ms | jitter 범위 |
| `[sheets] total` | 9,997 ms | **3,414 ms** | **-66%** |
| Lighthouse FCP | — | 0.5 s | — |
| Lighthouse Speed Index | 6.1 s | **2.5 s** | -59% |
| Lighthouse LCP (Core Web Vitals) | 10.46 s (Unscored) | **0.7 s** | scored 진입 |
| **LCP element render delay** (`div.font-medium`) | 10,460 ms | **3,800 ms** | **-64%** |
| Lighthouse TBT | — | 0 ms | — |

**학생이 실제로 시간표를 보는 시점 = element render delay**. 0.7s LCP는 정적 셸의 요소를 픽업한 값이라 UX 지표로는 오해 소지가 있음 — 실측 기준 10.46s → 3.8s, **약 6.6초 단축**.

남은 3.8s는 거의 그대로 Sheets API 외부 지연(3,397ms) — `fields` 마스크로 짤 수 있는 건 다 짠 상태. 추가로 더 줄이려면:

- **ranges 추가** — `fields` 적용 후 빈 셀이 이미 가벼워졌으므로 marginal gain 예상 (셀당 ~500바이트 → ~2~60바이트로 이미 떨어졌기 때문)
- **백그라운드 워밍 / SWR** — 학생 첫 요청을 cache miss에서 분리. 매니저가 시트 수정 후 revalidate 시 학생이 부담하는 구조를 끊는 방향
- **ISR (짧은 revalidate)** — 매니저 즉시 반영 요구사항과 충돌해 보류

학생 UX 기준 3.8s는 여전히 길지만, **10초 → 3.8초는 결정적 개선**. 추가 최적화는 다른 M18.5 항목들 끝낸 뒤 우선순위 재평가.
