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

`sheets.spreadsheets.get` 호출에 두 가지 좁히기를 같이 적용:

1. **`fields` 마스크** — parser가 실제로 읽는 경로만 응답에 포함 (출력 좁히기)
2. **`ranges` 파라미터** — 실제 사용 영역(A1:AI100)만 요청 (처리 범위 좁히기)

```ts
// before
const response = await sheets.spreadsheets.get({
  spreadsheetId: sheetId,
  includeGridData: true,
})

// after
const response = await sheets.spreadsheets.get({
  spreadsheetId: sheetId,
  ranges: ["A1:AI100"],
  fields:
    "sheets(data(rowData(values(formattedValue,effectiveFormat(backgroundColor,textFormat(foregroundColor))))),merges)",
})
```

parser와 fields 마스크 1:1 매핑:

| 마스크 경로 | parser에서 읽는 곳 |
|-------------|--------------------|
| `formattedValue` | `cell.formattedValue` (parseCategories, parseHeader, parseWeekHeader, parseGridSlots) |
| `effectiveFormat.backgroundColor` | `toHexColor(cell.effectiveFormat?.backgroundColor)` (parseCategories, parseGridSlots, applyImplicitMerges) |
| `effectiveFormat.textFormat.foregroundColor` | `toTextColor(cell.effectiveFormat?.textFormat?.foregroundColor)` (parseGridSlots) |
| `merges` | `firstTab.merges` (extractFirstTabSessions → parseSessionBlocks → applyMerges) |

ranges 산정 근거: 6열/블록 + 구분열 1 × 회차 5~6 + 첫 열 패딩 = 35열 (A~AI), 1행 패딩 + 4행 헤더 + 9행/주 × 8주 = 77행 → 여유 두고 100행.

### 두 최적화의 역할 차이 (사후 정정)

처음엔 "fields 마스크로 빈 셀이 이미 가벼워졌으니 ranges는 marginal일 것"이라고 예측했지만, 실측에서 ranges가 추가로 -71%를 더 줄였음. 가설이 틀린 이유 — 두 최적화가 **서로 다른 비용 축**을 건드린다는 걸 놓쳤기 때문.

| 비용 축 | `fields`가 줄이나 | `ranges`가 줄이나 |
|---------|------------------|------------------|
| **서버가 셀을 스캔/포맷 계산** | ❌ | ✅ ← 이게 가장 컸음 |
| **응답 페이로드 바이트** | ✅ | ✅ |
| 클라이언트 파싱 | ✅ (이미 ms 수준) | ✅ |

`fields` 마스크는 **출력 단계**만 좁힘 — Google 서버는 시트 전체(보통 1000행 × 26열 ≈ 26,000셀)를 스캔해 effective format을 계산한 뒤 마스크로 필터링한다. fetch 시간의 큰 부분이 이 **서버 측 CPU 시간**이었음. ranges로 스캔 대상을 ~3,500셀(약 7.4x 감소)로 줄이니 서버 처리 비용이 그만큼 떨어진 것.

> **빈 셀에 대한 흔한 오해**: "fields 마스크가 빈 셀의 출력 바이트를 줄여줬으니 빈 셀 최적화는 이미 진행된 것 아닌가?" — 줄어든 건 **빈 셀의 출력 바이트만**(~500B → ~2~60B). 빈 셀의 **존재 자체**나 **서버가 그 셀을 스캔하는 비용**은 그대로 남아 있었음. 그래서 ranges가 추가로 큰 효과를 낸 것.

요약: **`fields` = 응답 모양을 좁힘, `ranges` = 처리 범위를 좁힘.** 비용 축이 다르므로 동시에 적용해야 곱셈으로 줄어듦.

### 위험: 조용한 잘림

매니저가 회차 6+개 또는 주차 11+로 늘려 A1:AI100을 넘으면 학생 화면에서 **에러 없이 누락**됨. 현재는 노출되지 않은 위험으로 — keep 결정 후 M19(파서 옵션 KV 저장) 또는 M20(구분 열 검증) 라인에 **"마지막 행/열에 데이터가 있으면 경고"** 검증을 추가할 것.

향후 parser가 새 필드를 읽기 시작하면 fields 마스크도 같이 늘어나야 함 — 마스크에 없는 필드는 `undefined`로 와서 조용히 깨질 수 있음.

## 결과

배포 환경, 모바일 시뮬레이션, cache miss 강제 후 측정.

| 지표 | Before<br/>(`includeGridData`) | After fields<br/>마스크 | After fields<br/>+ ranges | 누적 변화 |
|------|--------------------------------|-------------------------|---------------------------|----------|
| `[sheets] fetch` | 9,996 ms | 3,397 ms | **969 ms** | **-90%** |
| `[sheets] parse` | 1 ms | 15 ms | 5 ms | jitter |
| `[sheets] total` | 9,997 ms | 3,414 ms | **974 ms** | **-90%** |
| Lighthouse FCP | — | 0.5 s | **0.3 s** | — |
| Lighthouse Speed Index | 6.1 s | 2.5 s | **0.7 s** | **-89%** |
| Lighthouse LCP | 10.46 s (Unscored) | 0.7 s (셸) / 3.8 s (실측) | **0.4 s** (실측 일치) | **-96%** |
| LCP element render delay | 10,460 ms | 3,800 ms | (breakdown 미노출) | — |
| Lighthouse TBT | — | 0 ms | 0 ms | — |
| Critical path latency | — | — | **924 ms** | — |

**fields 단계까지는 LCP 0.7s(셸)와 element render delay 3.8s(실측)가 갈렸지만, ranges까지 적용한 단계에선 LCP 0.4s가 곧 시간표가 보이는 시점**. 셸/콘텐츠 격차가 사라져 LCP breakdown에 별도 element render delay 항목이 안 나옴.

10.46s → 0.4s, **약 10초 단축**. 추가 최적화(백그라운드 워밍, SWR 등)는 더 이상 우선순위가 아님.

### 교훈

성능 분석 시 **"어디서 시간이 가는가"의 모델이 틀리면 잘못된 결정으로 이어진다**. 이 케이스에선 "응답 페이로드 크기"에만 주목해서 ranges를 marginal로 봤지만, 실제로는 Google 서버의 CPU 시간이 더 큰 비중이었음. 가설을 가볍게 세우되 측정으로 항상 검증할 것.
