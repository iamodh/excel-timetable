# Cache Components 모드와 `"use cache"`

Next.js 16의 `cacheComponents: true` 옵션은 App Router의 캐싱 모델을 뒤집는다. 기본값을 정적에서 동적으로 바꾸고, 캐시할 부분만 명시적으로 옵트인한다. 이 모드는 동적 라우트 안에서도 데이터 함수 단위 캐시를 유지할 수 있게 해준다.

---

## 1. 모드 비교

| 측면 | `cacheComponents: false` (legacy) | `cacheComponents: true` |
|------|----------------------------------|------------------------|
| 기본값 | 정적 (static) | 동적 (dynamic) |
| Opt-in 방향 | dynamic 옵트인 (`cookies()`, `dynamic = 'force-dynamic'`) | cache 옵트인 (`"use cache"`) |
| 캐시 단위 | 라우트 전체 | 함수/컴포넌트 단위 |
| `fetch()` | 자동 캐시 (`no-store`로 옵트아웃) | 자동 캐시 안 됨, `"use cache"` 필요 |
| non-fetch async (SDK) | `unstable_cache()`로 감싸야 캐시 | `"use cache"` 디렉티브 |
| `cookies()`/`headers()` 영향 | 라우트 전체를 dynamic화 | 해당 hole만 dynamic |
| 부분 prerender | ❌ (전부 정적 OR 전부 동적) | ✅ shell + hole |

---

## 2. `"use cache"` 디렉티브

함수 첫 줄에 `"use cache"`를 두면 그 함수의 반환값이 서버 캐시에 저장된다.

```ts
import { cacheTag } from "next/cache"

export async function getAllTimetableData() {
  "use cache"
  cacheTag("timetable")
  const spreadsheet = await fetchTimetableData()
  return extractFirstTabSessions(spreadsheet)
}
```

- 첫 호출: Google Sheets API 호출 + 파싱.
- 이후 호출: 캐시 hit이면 외부 API 호출 없음.
- `cacheTag("timetable")`: 이 캐시 엔트리에 이름표를 붙여서 나중에 `revalidateTag("timetable")`로 무효화할 수 있게 한다.
- `cacheTag()`는 캐시를 "켜는" 역할이 아니다. 캐시는 `"use cache"`로 켜고, 태그는 무효화 단위만 정한다.

### Google Sheets처럼 fetch가 아닌 SDK도 캐시 가능

`googleapis` SDK는 Next 내장 `fetch()`를 쓰지 않는다. legacy 모델에서는 `unstable_cache()`로 감싸야 했다. `cacheComponents: true`에서는 SDK 호출을 감싼 함수에 `"use cache"`만 붙이면 된다.

---

## 3. 동적 값과 캐시 스코프

`cookies()`, `headers()`, `new Date()`, `connection()` 같은 요청 시점 값은 `"use cache"` 함수 안에서 호출하면 안 된다. 사용자별 값을 공유 캐시에 넣어버린다.

```ts
// 좋음: 동적 컴포넌트 안에서 캐시 함수 호출
async function VisibleSessionTabs() {
  const sessions = await getAllTimetableData()  // "use cache" 함수
  return <SessionTabs sessions={sessions} />
}

// 나쁨: 캐시 함수 안에서 cookies 호출
async function bad() {
  "use cache"
  const c = await cookies()  // ❌ 사용자별 값을 공유 캐시에 넣음
  return c.get("student_pin")
}
```

동적 Server Component 안에서 `"use cache"` 함수 호출은 정상 패턴이다. 컴포넌트 렌더는 매 요청 실행돼도, 내부 데이터 함수는 캐시 hit을 낼 수 있다.

---

## 4. 두 캐시 레이어로 저장됨

`"use cache"` 함수가 prerender 가능한 컴포넌트 안에서 호출되면 두 군데에 저장된다.

### Data Cache — raw 반환값

함수의 반환값이 그대로 저장된다.

```ts
export async function getAllTimetableData(): Promise<TimetableData[]> {
  "use cache"
  cacheTag("timetable")
  // ...
  return extractFirstTabSessions(spreadsheet)
}
```

→ 결과 `TimetableData[]` 배열이 `timetable` 태그로 데이터 캐시에 저장.

### Full Route Cache — 렌더된 RSC payload

`"use cache"` 함수를 사용해서 그린 컴포넌트의 출력이 prerender 결과로 저장된다.

```tsx
async function VisibleSessionTabs() {
  const sessions = await getAllTimetableData()
  return <SessionTabs sessions={sessions} />
}
```

→ `<SessionTabs sessions={[...]}>` 형태의 RSC payload (props에 `TimetableData[]`가 직렬화돼 들어있음)가 페이지 prerender에 baked in.

### 컴포넌트가 동적 subtree 안에 있으면

`AuthGate` 같은 동적 컴포넌트 children으로 들어가면 prerender 대상이 아니다. 이때는 Data Cache에만 저장되고, RSC payload는 매 요청 새로 만든다.

```
AuthGate subtree (dynamic)
  └─ VisibleSessionTabs (request-time render)
      └─ getAllTimetableData() → Data Cache hit
```

Sheets API 호출은 여전히 캐시로 보호된다. RSC 직렬화는 매 요청 발생하지만 외부 API 왕복보다 훨씬 싸다.

---

## 5. 무효화

```ts
import { revalidateTag } from "next/cache"

revalidateTag("timetable", "max")
```

- 첫 인자: 무효화할 태그.
- 두 번째 인자: cacheLife 프로파일 신호. `"max"`는 즉시 폐기 + 우선 재생성.

이 호출은 Data Cache의 해당 태그 엔트리를 stale 마킹한다. Full Route Cache에서 그 데이터를 소비한 prerender도 자동으로 stale 전파된다.

stale-while-revalidate 모델이라 다음 요청은 stale 값을 즉시 받고, 백그라운드에서 새 값을 fetch해 캐시를 교체한다. 학생 N명이 동시에 새로고침해도 외부 API 호출은 1번만 발생한다.

---

## 6. 자주 헷갈리는 포인트

### "Server Component면 자동 캐시되는가?"

아니다. Server Component는 서버에서 실행된다는 뜻이지, 결과가 항상 지속 캐시된다는 뜻은 아니다. `cacheComponents: true`에서 캐시할 범위는 `"use cache"`로 명시한다.

### "dynamic이면 데이터 캐시도 안 되는가?"

아니다. 컴포넌트 렌더가 dynamic이어도 그 안에서 호출한 `"use cache"` 함수는 캐시 hit을 낼 수 있다. hole 경계와 캐시 경계는 다른 축이다.

### "`cacheTag`만 붙이면 캐시되는가?"

아니다. 캐시를 켜는 것은 `"use cache"`다. `cacheTag()`는 이미 캐시되는 엔트리에 이름표만 붙인다. `cacheTag()`만 있고 `"use cache"`가 없으면 매 호출마다 함수가 다시 실행된다.
