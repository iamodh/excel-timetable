# `"use cache"`가 Vercel 인스턴스 간에 공유되지 않는 문제

## 문제 상황

`"use cache"` + `cacheTag` 모델로 시간표/공지/PIN 캐싱을 구현하고 로컬 `next start`에서는 두 번째 요청부터 cache hit 확인. Vercel 배포 후에는 학생이 새로고침할 때마다 Google Sheets API가 다시 호출됨.

```
GET /                         → Duration 11835ms
  Sheets API GET              → 6373ms       ← 매 요청 호출
  Upstash POST × 2            → getNotice + getStoredPin 각각 호출
```

관리자 최신화와 무관하게 모든 진입에서 캐시 miss. 같은 데이터가 모든 학생에게 동일한데도 페이지 진입마다 5~6초 지연이 반복됨.

## 원인

Next.js 16의 `"use cache"` directive는 기본적으로 **process-local in-memory LRU**다. 공식 문서:

> "use cache stores entries in-memory. In serverless environments, memory is not shared between instances and is typically destroyed after serving a request."

Vercel serverless는 함수 인스턴스마다 메모리가 격리되고, cold start 또는 다른 인스턴스로 라우팅되면 캐시 miss. 함수 파일시스템도 빌드 산출물 외 영속 안 됨. 즉 Cache Components 모델의 데이터 캐시는 **인스턴스 격리가 디폴트 동작**이다 — 버그가 아니라 명시된 동작이고, 분산 공유를 원하면 별도 directive(`"use cache: remote"`) + 커스텀 `cacheHandlers` 구현이 필요하다.

로컬 `next start`는 단일 Node 프로세스라 in-memory LRU도 hit한다 → "로컬 캐시 동작은 Vercel 캐시 동작의 증거가 되지 않는다"는 게 가장 큰 함정.

## 해결 방법

`"use cache"` directive를 `unstable_cache()` 래퍼로 교체. Vercel은 옛 파이프라인(`unstable_cache`)을 **Vercel Data Cache로 자동 백킹**해주므로 인스턴스 간 공유가 자동으로 보장된다. `cacheComponents: true`는 그대로 유지 (정적 쉘 + 동적 홀 모델은 캐시 백엔드와 직교).

```ts
import { unstable_cache } from "next/cache"

export const getAllTimetableData = unstable_cache(
  async (): Promise<TimetableData[]> => {
    const spreadsheet = await fetchTimetableData()
    return extractFirstTabSessions(spreadsheet)
  },
  ["timetable"],
  { tags: ["timetable"], revalidate: false },
)
```

같은 패턴을 `getNotice`(`lib/notice.ts`), `getStoredPin`(`lib/pin.ts`)에도 적용. 호환성:

- 태그 시스템 동일 — `revalidateTag("timetable", "max")` 호출 지점은 코드 수정 없이 그대로 작동.
- API route 변경 없음 — `/api/revalidate`, `/api/notice`, `/api/pin` 그대로.
- 함수 시그니처 유지 — 기존 mock과 테스트 그대로 통과.

### 검토했지만 채택하지 않은 옵션

- **`"use cache: remote"` + custom `cacheHandlers`** — Upstash/Redis 기반 cacheHandler를 직접 구현. 새 모델의 미래 방향과 맞지만 `CacheEntry` 직렬화(ReadableStream), 태그 분산 동기화, soft tag 처리 등 구현 부담이 큼. `@neshca/cache-handler` 같은 community handler 도입 옵션도 있지만 검증 부담. 새 모델이 mature해진 후 재검토.
- **빌드 시 prerender + on-demand revalidate** — 데이터를 빌드 산출물에 박는 방향. `googleapis` SDK를 빌드 타임에 호출해야 하고, 매니저 시트 변경 후 빠른 반영 위해선 결국 revalidate 트리거가 필요해 다른 옵션과 비슷해짐.

## 결과

- 같은 인스턴스 재진입: ~870ms (이전 11800ms → 13배 빠름). Sheets API 호출 0회, Upstash 호출 0회.
- 다른 라우트(`/admin/categories`)도 `/`에서 데운 캐시를 hit. 인스턴스 간 공유 확정.
- Vercel 로그에서 `iad1.suspense-cache.vercel-infra.com` 도메인이 응답 처리하는 것이 핵심 증거 — `unstable_cache`를 백킹하는 Vercel Data Cache 분산 인프라.
- 한계: 무효화 후 첫 사용자는 여전히 5~6초 대기 (캐시 fill 비용 자체는 그대로). Sheets API 응답 크기 축소(`fields`, `ranges`)는 별도 작업.
- 교훈: **로컬 캐시 검증은 Vercel 캐시 동작의 증거가 되지 않는다.** 캐시 동작은 항상 분산 환경에서 검증해야 한다.
