# `"use cache"` / `cacheTag` / `revalidateTag` — Next.js 16 캐시 모델

`proxy-caching-patterns.md`의 패턴 A를 실제 구현하려고 보니, 그 문서에 적힌 `revalidate = false` + `<Suspense>` 조합만으로는 Next.js 16에서 `○ /`(정적 페이지 — `next build` 출력 기호)가 되지 않았다. Next.js 16에서 PPR(`experimental_ppr`)이 **Cache Components** 모델로 흡수되었기 때문이다. 이 문서는 그때 실제로 쓰게 된 세 가지 API를 정리한다.

---

## 1. 전제: Cache Components 활성화

```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
}
```

이 플래그를 켜면 Next.js가 "정적 쉘 + 동적 홀" 모델(PPR의 후속)을 활성화한다. 켜기 전까지는 `cookies()`가 트리 어딘가에 있기만 해도 페이지 전체가 `ƒ`(동적)로 판정되며, `<Suspense>`를 둘러도 소용없다. 켠 뒤에는 Suspense가 "여기 안쪽만 요청 시점에 실행해도 된다"는 **경계 선언** 역할을 제대로 한다.

부작용: Cache Components가 켜지면 "캐싱은 기본적으로 opt-in"이 된다. 즉 `cookies()` 없이 그냥 외부 API를 호출하는 페이지도 기본은 동적이고, 캐시하려면 아래 `"use cache"`를 명시적으로 달아야 한다.

---

## 2. `"use cache"` — 함수 단위 캐시 선언

함수 본문 맨 위 문자열 지시자. 해당 함수의 **리턴값**을 Next.js가 캐시한다.

```ts
export async function getAllTimetableData() {
  "use cache"
  cacheTag("timetable")
  const spreadsheet = await fetchTimetableData()  // Google Sheets API
  ...
}
```

- 첫 호출: 실제로 API를 때리고 결과 저장.
- 이후 호출: 캐시 hit → API 호출 0회.
- **주의:** `"use cache"` 범위 안에서는 `cookies()` / `headers()` 같은 request-time API를 호출하면 빌드 타임에 에러 난다. 이게 `AuthGate`를 캐시 함수 밖에 두고 `<Suspense>`로 분리한 이유다 (빌드 로그에 "Accessing Dynamic data sources inside a cache scope is not supported"로 찍힌다).

어디에 붙일지:
- **함수**에 붙이면 그 함수만 캐시됨 (이 프로젝트가 선택한 방식).
- **페이지(`page.tsx`) 최상단**에 붙이면 페이지 전체가 캐시됨. 단 페이지 트리에 dynamic 홀이 하나라도 있으면 그 하나를 `<Suspense>`로 격리해도 "페이지 전체가 캐시인데 그 안에 동적 호출이 있음"으로 충돌하는 경우가 생긴다. 이 프로젝트에서도 처음에 페이지 자체에 `"use cache"`를 달았다가 `AuthGate`의 `cookies()`와 충돌해서, **데이터 페칭 함수에만 붙이는 쪽으로 내렸다**.

---

## 3. `cacheTag(label)` — 캐시에 라벨 붙이기

같은 `"use cache"` 함수 안에서 호출한다. 그 캐시 엔트리에 문자열 태그를 붙여서, **나중에 이 태그만 골라 무효화**할 수 있게 한다.

```ts
export async function getAllTimetableData() {
  "use cache"
  cacheTag("timetable")    // 이 캐시에 "timetable" 라벨
  ...
}

export async function getNotice() {
  "use cache"
  cacheTag("notice")       // 이 캐시에 "notice" 라벨
  ...
}
```

태그를 안 달아도 캐시는 된다. 하지만 달지 않으면 무효화 방법이 시간 경과(revalidate 주기)뿐이라, 관리자가 "지금 당장 갱신"을 누를 수 없다. 태그 = "on-demand 무효화 훅".

태그 네이밍은 그냥 내가 정하는 문자열 키다. 중복 가능, 계층 구조 없음. `getNotice`가 `cacheTag("notice")`로 적혀 있으면, 다른 어디서든 `revalidateTag("notice", ...)` 하면 같이 만료된다.

---

## 4. `revalidateTag(tag, profile)` — 태그로 캐시 만료시키기

Route Handler / Server Action에서 호출한다. 해당 태그 달린 캐시 엔트리를 **stale로 표시**한다.

```ts
// app/api/revalidate/route.ts
revalidateTag("timetable", "max")
```

### 두 번째 인자: cacheLife 프로파일

Next.js 16부터 필수(공식은 "필수 권장"이고, 1-arg 호출은 deprecated). 이 값은 "무효화된 뒤 stale-while-revalidate(SWR) 동작을 얼마나 길게 할지"를 정한다.

SWR 동작이 뭐냐:
1. 관리자가 버튼 클릭 → 캐시를 "stale" 플래그로 표시.
2. 다음 학생 요청 → **stale 캐시를 즉시 반환** (학생은 기다리지 않음).
3. **동시에 백그라운드에서 서버가 실제 API를 호출해** 새 데이터를 받아 캐시를 교체.
4. 그 다음 학생부터는 새 캐시 hit.

즉 "버튼 클릭 직후 한 번"은 학생이 잠깐 구 데이터를 볼 수 있지만, 로딩 지연이 없다.

빌트인 프로파일(긴 순서):
- `"seconds"`, `"minutes"`, `"hours"`, `"days"`, `"weeks"`, `"max"`
- 커스텀: `{ expire: 3600 }` (초 단위)
- `"max"` = 가장 긴 SWR 창. Vercel이 "대부분 이걸 써라"라고 권장 (장기 유지 콘텐츠용).

이 프로젝트는 시간표/공지 둘 다 `"max"`로 고정했다. 이유:
- 외부에서 바뀌는 트리거(관리자 버튼, 공지 등록/삭제)가 명시적이라 시간 기반 만료에 기댈 이유가 없다.
- 학생 입장에서 로딩 지연이 가장 짧다 (stale 즉시 응답 + 백그라운드 갱신).

### `revalidatePath`와 차이

- `revalidatePath("/")`: 경로 단위로 쓸어버림. 그 경로의 모든 캐시를 한꺼번에 날림.
- `revalidateTag("timetable", "max")`: 라벨 찍힌 캐시만 선택 무효화. 여러 경로에 걸쳐 있어도 한 번에.

태그를 달아두면 `revalidateTag` 쪽이 더 정밀하다. 시간표 갱신이 공지 캐시까지 건드리지 않게 되는 이득.

### `updateTag`는 왜 안 썼는가

Next.js 16은 `updateTag`(Server Actions 전용)도 추가했다. "방금 내가 쓴 값을 같은 요청 안에서 즉시 읽는" read-your-writes 용도. 이 프로젝트의 최신화는 **Route Handler**(`POST /api/revalidate`)라서 `updateTag`를 못 쓴다. 학생 UX가 우선이지 관리자의 read-your-writes는 덜 중요하므로 SWR(`revalidateTag`)로 충분.

---

## 5. 적용 결과

```
[학생 접속]
CDN → 정적 쉘 HTML 즉시 반환
      └ Suspense 내부 AuthGate만 서버에서 실행 (쿠키 + Upstash 검증)
      → Google Sheets API 호출 0회

[관리자: 최신화 버튼]
POST /api/revalidate → revalidateTag("timetable", "max")
→ 다음 학생 요청: stale 즉시 반환 + 백그라운드에서 Sheets 1회 호출
→ 그 다음부터는 새 캐시 hit

[관리자: 공지 등록/삭제]
POST/DELETE /api/notice → setNotice / deleteNotice
→ revalidateTag("notice", "max") → notice 캐시만 만료
```

빌드 출력:

```
┌ ◐ /                       15m      1y
├ ◐ /admin
```

- `◐`(Partial Prerender): 외곽 정적 쉘 + 내부 동적 홀 = 패턴 A가 의도한 모양.
- `15m` / `1y`는 빌트인 기본 revalidate/expire 창 (태그 기반 무효화와 별개로 시간 안전망).

---

## 6. 자주 혼동되는 것들

### `"use cache"` vs `"use client"` / `"use server"`
전부 **문자열 지시자**이지만 스코프가 다르다. `"use cache"`는 함수/페이지 단위 **캐시 의미론**만 건드린다. 서버/클라이언트 경계와는 무관. 서버 컴포넌트 안의 서버 함수에 붙인다.

### 태그 네이밍을 어디서 보장하나
어디에도. `cacheTag("timetable")`과 `revalidateTag("timetable", ...)`의 문자열이 일치해야 하지만 타입 체크는 없다. 오타 내면 조용히 안 터진다. 상수로 뽑거나 `as const` 활용을 고려할 만하다 (현재 프로젝트는 파일 2개뿐이라 인라인 문자열로 둠).

### "max" 프로파일이 "캐시 무한정 유지"를 의미하는 건 아니다
`"max"`는 "SWR 창을 가장 길게"다. 백그라운드 갱신이 실패하거나 요청이 전혀 안 와도 내부 expire 기한(기본 1년 등)에 걸리면 결국 만료된다. "on-demand 전용"으로 쓰되 안전망은 프레임워크에 맡기는 세팅.

### `"use cache"` 바깥에서 `cacheTag` 호출하면?
에러. `cacheTag`는 반드시 `"use cache"` 스코프 안에서 호출해야 한다. Route Handler에서 태그를 다는 개념이 아니다 — Route Handler는 **만료 쪽**(`revalidateTag`)을 호출하는 자리.
