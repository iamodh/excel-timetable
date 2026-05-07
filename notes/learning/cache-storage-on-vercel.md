# Next.js 16 캐시 저장소 — `"use cache"` vs `unstable_cache`

같은 데이터 캐시처럼 보이지만 두 시스템은 저장소(storage backend)가 다르다. 로컬 `next start`에서는 둘 다 hit하지만 Vercel serverless 환경에서는 동작이 갈린다. 이 차이를 모르면 "로컬에서는 잘 되는데 프로덕션에서는 매 요청 외부 API를 친다"는 함정에 빠진다.

---

## 1. 두 시스템의 저장소 차이

| | `"use cache"` (Cache Components) | `unstable_cache` (legacy) |
|---|---------------------------------|---------------------------|
| 디폴트 저장소 | process-local in-memory LRU | process-local in-memory LRU |
| Vercel 자동 백킹 | ❌ 없음 | ✅ Vercel Data Cache |
| 분산 공유 | `"use cache: remote"` + `cacheHandlers` 직접 구현 | 자동 |
| 인터페이스 | 새 `cacheHandlers` 인터페이스 | 옛 `cacheHandler` 인터페이스 |
| 태그 시스템 (`revalidateTag`) | ✅ 작동 | ✅ 작동 (공유) |

핵심: **로컬에서는 둘 다 in-memory LRU지만 Vercel에서 갈린다.**

- `"use cache"`: Vercel이 새 인터페이스를 자동 백킹하지 않음. 디폴트가 그대로 인-메모리.
- `unstable_cache`: Vercel이 옛 인터페이스를 자동으로 Vercel Data Cache로 백킹.

---

## 2. Vercel 공식 문서가 명시한 한계

Next.js 공식 문서:

> "use cache stores entries in-memory. In serverless environments, memory is not shared between instances and is typically destroyed after serving a request, leading to frequent cache misses for runtime caching."

> "The default in-memory cache is isolated to each Next.js process. If you don't configure cacheHandlers, Next.js uses an in-memory LRU cache for both default and remote."

요약: serverless 환경에서 `"use cache"`의 디폴트 동작은 인스턴스 격리. 분산 공유는 명시적으로 `"use cache: remote"` + custom handler 구성이 필요하다.

---

## 3. `"use cache: remote"` directive

새 모델에서 분산 캐시를 옵트인하는 방법.

```ts
export async function getAllTimetableData() {
  "use cache: remote"  // ← directive 변경
  cacheTag("timetable")
  // ...
}
```

`next.config.ts`에 `cacheHandlers` 등록 필요:

```ts
const nextConfig = {
  cacheHandlers: {
    remote: require.resolve("./my-redis-handler"),
  },
}
```

핸들러는 `CacheEntry` 직렬화/역직렬화(ReadableStream 포함), 태그 분산 동기화, soft tag 처리 등을 모두 직접 구현해야 한다. `@neshca/cache-handler`, `@fortedigital/nextjs-cache-handler` 같은 community handler가 있지만 성숙도와 운영 부담은 직접 평가 필요.

---

## 4. `unstable_cache`의 Vercel 자동 백킹

```ts
import { unstable_cache } from "next/cache"

export const getAllTimetableData = unstable_cache(
  async () => { /* ... */ },
  ["timetable"],
  { tags: ["timetable"], revalidate: false },
)
```

- 첫 인자: 캐시할 async 함수.
- 두 번째 인자(`["timetable"]`): cache key parts. 함수 호출 인자와 결합되어 캐시 키를 만든다.
- 세 번째 인자(`{ tags, revalidate }`): 태그와 자연 stale 전환 시간.

Vercel에 배포하면 자동으로 Vercel Data Cache에 저장된다. 개발자가 핸들러 구현할 필요 없음. 로그에서 `iad1.suspense-cache.vercel-infra.com` 같은 도메인이 응답을 처리하는 것이 백킹의 흔적.

`unstable_` 접두사는 시그니처가 향후 바뀔 수 있다는 의미일 뿐 deprecated가 아니다. Next.js 16에서도 정식 지원.

---

## 5. 태그 시스템은 공유

두 시스템 모두 `revalidateTag(tag, profile)`를 통한 태그 기반 무효화를 지원한다. 호출 코드는 동일하다.

```ts
revalidateTag("timetable", "max")  // 양쪽 시스템 모두 작동
```

따라서 `"use cache"` → `unstable_cache` 마이그레이션 시 `/api/revalidate` 같은 무효화 엔드포인트는 코드 변경 없이 그대로 작동한다. 마이그레이션이 점진적/부분적으로 가능한 이유.

---

## 6. `cacheComponents: true`와의 관계

`cacheComponents` 모드는 **렌더 모델**이지 **캐시 백엔드**가 아니다. 정적 쉘 + 동적 홀 구조는 어떤 캐시 시스템을 쓰든 유지된다.

```
cacheComponents: true            ← 렌더 모델 (Suspense 경계 prerender)
       ⊥
"use cache" or unstable_cache    ← 데이터 캐시 백엔드
```

따라서 Vercel 인스턴스 간 캐시 공유 문제를 해결하려고 `cacheComponents`를 끌 필요 없다. 데이터 캐시 함수만 `unstable_cache`로 교체하는 것이 가장 적은 변경.

---

## 7. 로컬 `next start`의 함정

로컬에서 in-memory LRU가 hit하는 이유는 단일 Node 프로세스이기 때문이다. 두 번째 요청도 같은 프로세스 메모리를 본다.

```
로컬 next start:
  요청1 → in-memory miss → fetch → 캐시 fill
  요청2 → 같은 프로세스 → in-memory hit ✅

Vercel serverless:
  요청1 → 인스턴스A in-memory miss → fetch → 인스턴스A 캐시 fill
  요청2 → 인스턴스B (콜드 또는 다른 인스턴스) → in-memory miss → 또 fetch ❌
```

**로컬 캐시 동작은 Vercel 캐시 동작의 증거가 되지 않는다.** 캐시 검증은 항상 Vercel 환경(또는 동등한 분산 환경)에서 해야 한다. `npm run start`로 검증하면 됐던 다른 동작들과 달리, 캐시는 배포해서 직접 봐야 한다.

---

## 8. 자주 헷갈리는 포인트

### `unstable_` 접두사가 붙어 있는데 deprecated인가
아니다. Next.js 16에서도 정식 API. 이름은 시그니처가 향후 바뀔 수 있다는 의미였지 안정성이 떨어진다는 뜻이 아니다.

### `"use cache"`와 `unstable_cache`를 같이 쓸 수 있나
가능하다. 같은 프로젝트에서 함수마다 다른 시스템을 써도 된다. 다만 인스턴스 간 공유가 필요한 데이터는 모두 `unstable_cache`로 통일하는 게 안전.

### Vercel Data Cache는 무한 용량인가
아니다. Vercel 플랜별로 용량 제한이 있고, LRU 정책으로 evict될 수 있다. 다만 일반적인 시간표/공지 같은 작은 데이터에서는 문제 안 됨.

### `revalidate: false`는 영원히 캐시되는가
자연 stale 전환을 안 한다는 뜻이지, expire 안 한다는 뜻이 아니다. 명시적 `revalidateTag` 호출로 무효화하기 전까지는 캐시가 유효. 진실원이 명시적 트리거로만 바뀌는 시간표/공지에 적합.
