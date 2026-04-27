# Cache Components on/off 비교

Next.js 16에서 `cacheComponents: true`를 켜면 App Router의 캐싱 모델이 달라진다. 이 프로젝트는 현재 켠 상태다.

```ts
// next.config.ts
const nextConfig = {
  cacheComponents: true,
}
```

이 문서는 켰을 때와 껐을 때의 차이를, 이 프로젝트의 시간표 캐싱 구조 기준으로 정리한다.

---

## 1. 한 줄 요약

| 설정 | 캐싱 모델 | 데이터 캐시 선언 | 동적 값 처리 |
|------|-----------|------------------|--------------|
| `cacheComponents: true` | 정적 쉘 + 동적 홀 | `"use cache"` / `cacheTag()` | `cookies()`, `new Date()` 등을 Suspense 안쪽으로 격리 |
| `cacheComponents` 끔 | 이전 App Router 모델 | `fetch` 옵션 / `unstable_cache()` / route config | `cookies()` 등이 route 전체를 동적화하기 쉬움 |

현재 프로젝트는 Google Sheets를 Next 내장 `fetch()`가 아니라 `googleapis` SDK로 호출한다. 그래서 `fetch(url, { next: { tags } })`를 직접 쓸 수 없고, SDK 호출을 감싼 함수에 `"use cache"`를 붙인다.

```ts
export async function getAllTimetableData() {
  "use cache"
  cacheTag("timetable")
  const spreadsheet = await fetchTimetableData()
  return extractFirstTabSessions(spreadsheet)
}
```

---

## 2. 켰을 때: `cacheComponents: true`

### 기본 성격

- Cache Components 모델을 활성화한다.
- 페이지 안에서 정적 조각과 요청 시점 조각을 섞을 수 있다.
- Suspense는 단순 로딩 UI가 아니라 정적 쉘과 동적 홀의 경계가 된다.
- 캐싱은 opt-in 성격이 강하다. 캐시하고 싶은 함수/컴포넌트/route에 `"use cache"`를 명시한다.

```txt
정적 쉘
├─ Suspense 홀: AuthGate       cookies() + Upstash 검증
├─ Suspense 홀: NoticeBanner   getNotice() 캐시 조회
└─ 시간표 영역                 getAllTimetableData() 캐시 조회
```

### 데이터 캐시

`"use cache"`는 함수, 컴포넌트, route의 반환값을 캐시 대상으로 만든다.

```ts
export async function getAllTimetableData() {
  "use cache"
  cacheTag("timetable")
  const spreadsheet = await fetchTimetableData()
  return extractFirstTabSessions(spreadsheet)
}
```

- 첫 호출: Google Sheets API 호출 + 파싱.
- 이후 호출: 캐시 hit이면 API 호출 없음.
- `cacheTag("timetable")`: 이 캐시 엔트리에 이름표를 붙인다.
- `revalidateTag("timetable", "max")`: 관리자 최신화 때 이 이름표가 붙은 캐시를 stale 처리한다.

### 동적 값

`cookies()`, `headers()`, `new Date()`, `connection()` 같은 요청 시점 값은 캐시 스코프 안에 넣으면 안 된다.

```txt
좋음:
Suspense 안쪽 Server Component
→ cookies()
→ 캐시된 getAllTimetableData() 호출 가능

나쁨:
"use cache" 함수
→ cookies() 호출
→ 사용자별 값을 공유 캐시에 넣을 위험
```

동적 Server Component 안에서 `"use cache"` 함수 호출은 정상 패턴이다. 컴포넌트 렌더는 매 요청 실행될 수 있어도, 내부 데이터 함수는 캐시 hit을 낼 수 있다.

---

## 3. 껐을 때: 이전 App Router 모델

`cacheComponents`를 끄면 `"use cache"` / `cacheTag()` 중심 모델을 사용할 수 없다. 캐싱은 다음 방식으로 제어한다.

### Next 내장 `fetch()`

```ts
await fetch("https://...", {
  cache: "force-cache",
  next: { tags: ["timetable"] },
})
```

또는 시간 기반 갱신:

```ts
await fetch("https://...", {
  next: { revalidate: 3600 },
})
```

### `fetch()`가 아닌 함수

DB 클라이언트, SDK, ORM처럼 Next 내장 `fetch()`를 쓰지 않는 경우 `unstable_cache()`로 감싼다.

```ts
import { unstable_cache } from "next/cache"

export const getAllTimetableData = unstable_cache(
  async () => {
    const spreadsheet = await fetchTimetableData()
    return extractFirstTabSessions(spreadsheet)
  },
  ["timetable"],
  {
    tags: ["timetable"],
    revalidate: false,
  },
)
```

### route config

route 단위로도 제어한다.

```ts
export const revalidate = false
export const dynamic = "auto"
```

이전 모델에서는 `cookies()` 같은 Request-time API가 route의 정적/동적 판정에 크게 영향을 준다. Suspense로 감쌌다고 해서 Cache Components처럼 정적 쉘과 동적 홀을 같은 정밀도로 나눌 수 있다고 기대하면 안 된다.

---

## 4. 현재 프로젝트에 적용하면

### 켠 상태 유지

현재 구조:

```txt
Google Sheets API
→ googleapis SDK
→ fetchTimetableData()
→ getAllTimetableData()  "use cache" + cacheTag("timetable")
→ page/admin page에서 재사용
```

장점:

- `googleapis` SDK 호출 결과도 함수 단위로 캐시할 수 있다.
- `/`, `/admin/categories` 같은 여러 route가 같은 시간표 캐시를 공유할 수 있다.
- 관리자 최신화는 `revalidateTag("timetable", "max")`로 시간표 캐시만 무효화할 수 있다.
- 인증 같은 요청별 로직은 Suspense 홀로 격리하고, 시간표 원천 데이터 캐시는 유지할 수 있다.

### 끄는 경우 필요한 변경

```txt
"use cache" 제거
cacheTag("timetable") 제거
getAllTimetableData()를 unstable_cache()로 교체
revalidateTag("timetable")는 unstable_cache tags와 연결
AuthGate/Suspense 구조의 의미 재검토
```

이 프로젝트는 Google Sheets가 모든 사용자에게 같은 데이터를 제공하고, 관리자 버튼으로 명시 갱신하는 구조다. 따라서 Cache Components를 켠 상태에서 `"use cache"` + `cacheTag()`를 쓰는 현재 모델이 더 단순하다.

---

## 5. 자주 헷갈리는 말

### "Server Component면 자동 캐시되는가?"

아니다. Server Component는 서버에서 실행된다는 뜻이지, 결과가 항상 지속 캐시된다는 뜻은 아니다. `cacheComponents: true`에서는 캐시할 범위를 `"use cache"`로 명시하는 것이 이 프로젝트의 기준이다.

### "정적 데이터면 `use cache`가 없어도 되는가?"

정적 JSX 쉘은 prerender될 수 있다. 하지만 외부 API/SDK 호출 결과를 여러 요청에서 재사용하려면 별도의 데이터 캐시 선언이 필요하다. 이 프로젝트에서는 그 선언이 `"use cache"`다.

### "cacheTag는 캐시를 켜는 기능인가?"

아니다. 캐시를 켜는 것은 `"use cache"`다. `cacheTag()`는 이미 캐시되는 엔트리에 이름표를 붙여서 나중에 `revalidateTag()`로 무효화할 수 있게 한다.

### "dynamic이면 데이터 캐시도 안 되는가?"

아니다. 컴포넌트 렌더가 dynamic이어도 그 안에서 호출한 `"use cache"` 함수는 캐시 hit을 낼 수 있다. 홀 경계와 캐시 경계는 다른 축이다.

---

## 6. 관련 문서

- `problem-solving/use-cache-and-tags.md` — 현재 구현의 `"use cache"` / `cacheTag` / `revalidateTag`
- `learning/prerender-and-dynamic-rendering.md` — Server/Client와 Prerender/Dynamic 축 분리
- `learning/shell-and-hole.md` — 정적 쉘과 동적 홀 모델
- `problem-solving/proxy-caching-patterns.md` — 인증을 Suspense 홀로 분리한 사례
