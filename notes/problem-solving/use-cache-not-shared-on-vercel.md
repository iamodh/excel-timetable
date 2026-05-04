# `"use cache"`가 Vercel 인스턴스 간에 공유되지 않는 문제

`use-cache-and-tags.md`에 정리한 `"use cache"` + `cacheTag` 모델은 로컬 `next start`에서는 정상 동작했지만, Vercel 배포 후 새로고침할 때마다 Google Sheets API가 다시 호출되는 현상을 발견했다. 같은 데이터가 모든 사용자에게 동일하게 캐시되어야 함에도 페이지 진입마다 6초대 지연이 반복되었다.

이 문서는 그 원인을 추적하면서 알게 된 Next.js 16 캐시 모델의 구조적 한계, 그리고 `unstable_cache`로 회귀해 해결한 과정을 기록한다.

---

## 1. 발견한 현상

배포 후 Vercel Function Logs:

```
GET /                         → Sheets API 호출 5446ms (매 요청)
GET /admin/categories         → Sheets API 호출 (또) 매 요청
관리자 최신화와 무관하게 모든 진입에서 캐시 miss
```

로컬 `npm run build && npm run start`에서는 두 번째 요청부터 cache hit. Vercel에서만 매번 miss. `console.log("[sheets] fetchTimetableData", ...)` 로그가 매 요청 찍히는 것으로 확정.

---

## 2. 처음 세웠던(틀린) 가설

> Vercel Data Cache가 `"use cache"`도 자동으로 백킹해주므로 분산 공유될 것이다.

이건 옛날 파이프라인(`fetch` 확장, `unstable_cache`)을 기준으로 만들어진 인상이었다. 새 파이프라인(`cacheComponents` + `"use cache"`)에는 적용되지 않는다.

---

## 3. 실제 원인 — 공식 문서가 명시한 한계

[Next.js 공식 문서 — `use cache: remote`](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote):

> **"`use cache` stores entries in-memory. In serverless environments, memory is not shared between instances and is typically destroyed after serving a request, leading to frequent cache misses for runtime caching."**

[Next.js 공식 문서 — `cacheHandlers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers):

> **"The default in-memory cache is isolated to each Next.js process. If you don't configure `cacheHandlers`, Next.js uses an in-memory LRU cache for both `default` and `remote`."**

즉 Next.js 16의 `"use cache"`는 **기본적으로 process-local in-memory LRU**다. 로컬 단일 프로세스에서는 hit이지만, Vercel serverless에서는:

- in-memory: cold start 또는 다른 인스턴스로 라우팅되면 miss
- filesystem: Vercel 함수 파일시스템은 빌드 산출물 외 영속 안 됨

결과적으로 **Cache Components 모델의 데이터 캐시는 인스턴스 격리가 디폴트 동작**이다. 버그가 아니라 명시된 동작이고, 그래서 Next.js 16은 별도 directive(`"use cache: remote"`)를 도입했다.

---

## 4. 해결 옵션 비교

세 가지 길이 있다.

| 옵션 | 방식 | 장점 | 단점 |
|------|------|------|------|
| **A. `"use cache: remote"` + custom `cacheHandlers`** | Upstash/Redis 기반 cacheHandler를 직접 구현하고 directive를 `"use cache: remote"`로 바꾼다 | 새 모델과 일관됨. Cache Components 미래 방향과 맞음. | `CacheEntry` 직렬화(ReadableStream), 태그 분산 동기화, soft tag 처리 등 핸들러 구현 부담. 또는 `@neshca/cache-handler` 같은 외부 라이브러리 도입. |
| **B. `unstable_cache`로 회귀** | `"use cache"` directive를 `unstable_cache()` 래퍼로 교체 | 옛 파이프라인은 Vercel Data Cache로 자동 백킹됨. 코드 한 곳 수정. 새 인프라 0개. | 이름에 `unstable_` 붙어 있음(시그니처 안정성 의미일 뿐 deprecated 아님). 향후 `"use cache: remote"` 성숙 시 다시 옮겨야 할 수도. |
| **C. 빌드 시 prerender(`generateStaticParams`) + on-demand revalidate** | 데이터를 빌드 산출물에 박아 정적 산출 | 캐시 인프라 자체 불필요 | `googleapis` SDK를 빌드 타임에 호출해야 하고, 매니저 시트 변경 후 빠른 반영 위해선 결국 revalidate 트리거 필요 → A/B와 비슷해짐. |

[Next.js Discussion #88038](https://github.com/vercel/next.js/discussions/88038) 에서 같은 문제를 겪은 다수가 **B (unstable_cache)** 를 채택. 새 모델(`"use cache"`)이 mature해질 때까지의 검증된 우회로로 자리 잡음.

---

## 5. 채택한 해결책 — B (`unstable_cache`)

`cacheComponents: true`는 그대로 둔다(정적 쉘 + 동적 홀 모델은 캐시 인프라와 직교). 데이터 캐시 함수만 `unstable_cache`로 교체.

### Before

```ts
// lib/sheets.ts
export async function getAllTimetableData(): Promise<TimetableData[]> {
  "use cache"
  cacheLife("max")
  cacheTag("timetable")
  const spreadsheet = await fetchTimetableData()
  return extractFirstTabSessions(spreadsheet)
}
```

### After

```ts
// lib/sheets.ts
import { unstable_cache } from "next/cache"

export const getAllTimetableData = unstable_cache(
  async (): Promise<TimetableData[]> => {
    const spreadsheet = await fetchTimetableData()
    return extractFirstTabSessions(spreadsheet)
  },
  ["timetable"],          // cache key parts
  { tags: ["timetable"], revalidate: false },
)
```

같은 패턴을 `getNotice` (`lib/notice.ts`), `getStoredPin` (`lib/pin.ts`)에도 적용.

### 호환성

- **태그 시스템 동일**: `revalidateTag("timetable", "max")` 호출 지점은 코드 수정 없이 그대로 작동. `unstable_cache`의 `tags` 옵션과 `cacheTag` directive는 같은 무효화 시스템을 공유.
- **API route 변경 없음**: `/api/revalidate`, `/api/notice`, `/api/pin` 모두 그대로.
- **테스트 변경 없음**: 함수 시그니처(`async () => Promise<T>`)가 유지되어 기존 mock 그대로 통과.

---

## 6. 검증 — Vercel 로그 비교

### Before (문제 상황)

```
GET /                       → Duration 11835ms
  Sheets API GET            → 6373ms       ← 매 요청 호출
  Upstash POST × 2          → getNotice + getStoredPin 각각 호출
```

### After (`unstable_cache` 적용 후)

```
GET / (첫 진입)              → Duration 12046ms (캐시 fill)
  Sheets API GET            → 5446ms      ← 첫 miss
  Upstash POST              → 1회

GET / (재진입)               → Duration 868ms     ← 13배 빨라짐
  iad1.suspense-cache.vercel-infra.com/v1/suspense-cache/... → 7ms
  Sheets API 호출 없음
  Upstash 호출 없음

GET /admin/categories (첫 진입) → Duration 906ms
  iad1.suspense-cache.vercel-infra.com → 6ms
  Sheets API 호출 없음        ← /에서 데운 캐시를 다른 라우트가 hit
```

핵심 증거: `iad1.suspense-cache.vercel-infra.com` 도메인이 응답을 처리. 이게 **Vercel이 `unstable_cache`를 백킹하는 분산 캐시 인프라**. 다른 라우트(`/admin/categories`)가 `/`에서 데운 캐시를 그대로 hit하는 것으로 인스턴스 간 공유 확정.

---

## 7. 잔여 작업과 한계

- **Miss 비용 자체는 그대로**: 관리자가 `revalidateTag` 트리거 후 첫 사용자는 여전히 5~6초 대기. `notes/todo.md`의 Sheets API 응답 축소(`fields`, `ranges`) 작업은 이번 변경과 별개로 여전히 가치가 있다.
- **`use-cache-and-tags.md`의 일부 설명은 부분적으로 outdated**: "use cache"가 캐시 인프라 위에 어떻게 떨어지는지에 대한 부분은 Vercel에서 보장되지 않는다. directive와 태그 시스템 자체에 대한 설명은 여전히 유효.
- **장기적으로는 A 옵션을 다시 검토**할 수 있다. `"use cache: remote"`가 Vercel에서 1급 지원으로 자리 잡거나 community handler가 충분히 성숙하면.

---

## 8. 자주 혼동되는 것들

### `"use cache"`와 `unstable_cache`는 같은 캐시인가
아니다. **저장소가 다르다.**
- `"use cache"` (cacheComponents) → 새 `cacheHandlers` 인터페이스 → 기본 in-memory LRU
- `unstable_cache` → 옛 `cacheHandler` 인터페이스 → Vercel에서는 자동으로 Vercel Data Cache로 백킹

태그(`tags`)는 공유한다. `revalidateTag("timetable")`가 두 시스템 모두에 작동.

### `unstable_` 접두사가 붙어 있는데 deprecated인가
아니다. Next.js 16에서도 정식 API. 이름은 시그니처가 향후 바뀔 수 있다는 의미였지 안정성이 떨어진다는 뜻이 아니다. Vercel/Next 팀 자신도 "곧 제거"라고 말한 적 없다.

### `cacheComponents: true`를 끄고 갈 수도 있나
가능하지만 이 프로젝트는 정적 쉘 + Suspense 홀 모델에서 이득을 보고 있다(인증 게이트와 시간표 fetch를 분리). 데이터 캐시 인프라(`unstable_cache` vs `"use cache"`)와 렌더 모델(`cacheComponents`)은 직교라, **렌더 모델은 유지하고 데이터 캐시 백엔드만 교체**하는 게 가장 적은 변경.

### 로컬에서는 왜 잘 됐나
`next start`는 단일 Node 프로세스. in-memory LRU가 같은 메모리를 보므로 두 번째 요청부터 hit. 이게 "Vercel에서도 잘 되겠지"라는 잘못된 추론을 유발했다. **로컬 캐시 동작은 Vercel 캐시 동작의 증거가 되지 않는다**는 게 이번 디버깅의 가장 큰 교훈.

---

## 9. 참고

- [Next.js Docs — Directives: use cache: remote](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote)
- [Next.js Docs — cacheHandlers](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers)
- [Next.js Discussion #88038 — "use cache works locally but not on Vercel Production"](https://github.com/vercel/next.js/discussions/88038)
- [Next.js Discussion #87842 — "Is use cache gonna cache anything in serverless?"](https://github.com/vercel/next.js/discussions/87842)
- [@neshca/cache-handler](https://github.com/caching-tools/next-shared-cache) / [@fortedigital/nextjs-cache-handler](https://github.com/fortedigital/nextjs-cache-handler) — 옵션 A를 갈 때 참고할 만한 community handler
- 같은 폴더의 `use-cache-and-tags.md` — directive/태그/`revalidateTag` 모델 설명. 이 문서와 함께 읽으면 전체 그림이 맞춰짐.
