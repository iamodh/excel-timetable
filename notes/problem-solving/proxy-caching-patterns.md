# proxy 캐싱 문제 — 세 가지 해결 패턴 심화

`middleware-caching-issue.md`가 "왜 문제가 생기나"를 다룬다면, 이 문서는 세 가지 해결 패턴(A/B/C)을 **각 패턴이 실제로 어떻게 동작하는지** 까지 풀어서 정리한다. 비교 표는 원문에 있으므로 여기서는 자주 헷갈리는 지점만 짚는다.

---

## 1. 먼저: 동적화의 범인은 누구인가

처음 보면 "`SessionTabs`가 동적 컴포넌트가 되어 API를 자동 호출하는 것"처럼 보인다. **틀렸다.**

```tsx
// components/SessionTabs.tsx
"use client"
export function SessionTabs({ sessions }: { sessions: TimetableData[] }) {
  // sessions는 props로 받기만 함 — API 호출 안 함
}
```

- `SessionTabs`는 클라이언트 컴포넌트이지만 **데이터를 스스로 가져오지 않는다**. props로 받기만 한다.
- Google Sheets API를 호출하는 건 부모인 `app/page.tsx` (Server Component).
- `revalidate-and-middleware.md`에 적어둔 대로, **동적/정적 판정은 페이지(Server Component) 레벨**에서 결정된다. 클라이언트 컴포넌트는 이 판정에 영향을 주지 않는다.

실제로 벌어지는 일:

```
요청 → proxy.ts가 cookies 읽음
     → Next.js: "이 경로는 동적이다" 판정
     → app/page.tsx 매 요청마다 재실행
     → getAllTimetableData() 매 요청마다 호출 (= Google Sheets API 호출)
     → <SessionTabs sessions={...}> 에 props로 내려줌
```

**범인은 proxy에 걸려서 동적이 된 `page.tsx`다.** `SessionTabs`는 결과적으로 매번 새 데이터를 받는 수혜자(또는 피해자)일 뿐.

---

## 2. 패턴 A — matcher에서 `/` 제외 + nested Server Component + Suspense

### 핵심 아이디어

- proxy가 `/` 경로를 안 건드리게 한다 → `/`에 대한 동적화 강제가 사라짐.
- 쿠키 검증은 페이지 내부의 **nested Server Component**가 맡는다 (`cookies.md §6`의 "Upstash 매 요청 비교" 원칙 유지).
- 그 nested 컴포넌트를 `<Suspense>`로 감싸서 **"여기 안쪽만 요청 시점에 실행해도 OK"** 라는 경계를 명시적으로 그어준다.

### "쿠키 검증을 클라 컴포넌트로 분리한다"는 오해

처음엔 "쿠키 검증을 분리하자 = 클라 컴포넌트로 빼자"로 착각하기 쉽다. **아니다.**

- 쿠키 검증은 **Server Component에서 해야 한다.** 이유: Upstash 저장값과 비교해야 하고 (`cookies.md §6`), 이 비교 로직은 서버에서만 동작한다.
- 클라에서 검증하면 브라우저가 PIN 정답을 알고 있어야 해서 설계가 근본부터 무너진다.

### 구현 스케치

```tsx
// proxy.ts
export const config = {
  matcher: ["/admin/:path*"],  // "/" 제거
}

// app/page.tsx (Server Component, 정적)
export const revalidate = false

export default async function Page() {
  const sessions = await getAllTimetableData()
  return (
    <>
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      <SessionTabs sessions={sessions} />
    </>
  )
}

// components/AuthGate.tsx (Server Component)
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function AuthGate() {
  const pin = (await cookies()).get("student_pin")?.value
  const stored = await getStoredPin()
  if (pin !== stored) redirect("/pin")
  return null
}
```

### Suspense가 하는 일

`<Suspense>`는 로딩 스피너용 UI 도구가 아니라, 여기서는 **Next.js에게 동적 경계를 알리는 표지판** 역할이다.

- Suspense 없이 `cookies()`를 그냥 호출 → Next.js: "이 페이지 전체가 쿠키에 의존하네, 동적 렌더링" → 패턴 A 효과 사라짐.
- Suspense로 감쌈 → Next.js: "바깥은 정적 prerender, 안쪽만 요청 시점 실행" → 정적 쉘 + 동적 인증 분리 성공.

### 결과

- `sessions` 데이터는 정적 쉘(HTML)에 박혀 **CDN에 캐시된다**.
- 다음 학생 접속 시 Google Sheets API 호출 없음.
- 쿠키 검증은 여전히 매 요청마다 일어나며 Upstash와 비교 → PIN 변경 시 즉시 무효화 속성도 그대로 유지.

---

## 3. 패턴 B — proxy matcher의 `missing` 조건 (왜 안 되는가)

### 핵심 아이디어

proxy matcher에 `missing` 조건을 걸어서 **쿠키가 없는 요청만 proxy를 타게** 한다.

```ts
export const config = {
  matcher: [
    { source: "/", missing: [{ type: "cookie", key: "student_pin" }] },
  ],
}
```

- 쿠키가 없는 학생 → proxy 실행 → `/pin` 리다이렉트.
- 쿠키가 있는 학생 → proxy 건너뜀 → 이론상 정적 캐시 적중.

### 왜 이게 보안 설계를 깨는가 — 시나리오

`cookies.md §6`의 핵심 설계: **쿠키값과 Upstash값을 매 요청마다 비교**한다. 덕분에 "관리자가 PIN 변경 → 기존 세션 즉시 무효화" 가 가능하다.

```
[현재 설계]
Upstash: student_pin = "1234"
학생 A 쿠키: student_pin=1234  → proxy: "1234 === 1234" → 통과

관리자가 PIN을 "5678"로 변경
학생 A 쿠키는 여전히 1234  → proxy: "1234 !== 5678" → /pin 리다이렉트 ✅
```

패턴 B를 적용하면:

```
[패턴 B]
matcher: 쿠키 없는 요청만 proxy 실행
학생 A 쿠키: student_pin=1234 (존재함)
→ proxy를 건너뛰고 /로 들어감
→ /는 정적 캐시 → Upstash 비교가 일어날 기회 자체가 없음

관리자가 PIN을 "5678"로 변경
학생 A는 여전히 1234 쿠키로 /에 접근 가능 ❌
→ 보안 설계 파괴
```

### 왜 matcher로는 해결 못 하는가

matcher의 `has`/`missing` 조건은 **쿠키 유무 같은 표면 정보**만 볼 수 있다. "쿠키값이 Upstash 저장값과 일치하는가?" 는 동적 로직이라 matcher(정적 설정)에 넣을 수 없다.

결국 보안을 지키려면 페이지 내부에서 재검증해야 하고, 그 순간 **패턴 A와 동일해진다**. 패턴 B는 혼자서는 성립하지 않는다.

### 실측이 필요한가

**논리적으로 이미 탈락**이다 (보안 설계 충돌). "그래도 matcher `missing` 조건이 정적 판정을 살려주긴 하나?" 를 확인하려면 빌드 결과(`ƒ /` vs `○ /`)를 봐야 하지만, 패턴 B 자체가 성립하지 않으므로 실측은 의미 없다.

---

## 4. 패턴 C — 정적 쉘 + 클라이언트 fetch (왜 "퇴보"인가)

### 핵심 아이디어

- `/`는 완전 정적 HTML (빈 쉘).
- 시간표 데이터는 브라우저에서 `fetch('/api/timetable')` 로 가져온다.
- 쿠키 검증도 Route Handler에서 처리 (Route Handler는 본래 per-request라 쿠키 접근 자연스러움).

### 왜 "퇴보"라고 표현했는가

`nextjs-rendering-and-cdn.md`의 **3단계 진화** 관점에서 보면 명확하다.

| 단계 | 데이터 페칭 위치 | HTML에 데이터 포함? | 첫 화면 |
|------|----------------|-------------------|--------|
| CRA (SPA) | 클라이언트 `useEffect` + fetch | ❌ 빈 HTML | 공백 |
| 2단계 SSG/ISR | 빌드 시 서버에서 | ✅ 박힘 | 완성 |
| **3단계 RSC (현재)** | **async Server Component** | ✅ 박힘 | 완성 |
| 패턴 C | 클라이언트 fetch | ❌ 빈 HTML | 공백 |

패턴 C는 **CRA 스타일로 되돌아간다**. 구체적으로:

```
[현재 3단계]
요청 → CDN → 시간표 데이터가 박힌 HTML 즉시 수신 → 렌더 완료

[패턴 C]
요청 → CDN → 빈 쉘 HTML → 브라우저에서 JS 실행
     → fetch(/api/timetable) → 응답 대기 → 로딩 스피너
     → 데이터 도착 → 렌더
```

### 잃게 되는 것들

1. **첫 화면 공백 문제 재발** — `nextjs-rendering-and-cdn.md §1`이 React의 고질병으로 꼽은 것. 카카오톡 인앱 브라우저 같은 느린 환경에서 체감 큼.
2. **`useEffect` + 3-state 부활** — SessionTabs가 props로 완성된 데이터를 받던 구조가 깨지고, 클라이언트에서 loading/error/data 상태 관리를 다시 해야 한다. RSC가 해결했던 바로 그 문제.
3. **크롤러/링크 프리뷰 약화** — 빈 HTML은 카카오톡 OG 파서 등이 내용을 못 읽음.

### 캐싱은 살지만 비용이 비싸다

페이지는 완전 정적이 되므로 CDN 캐시 문제는 해결된다. 하지만 **RSC가 준 이득을 포기하는 거래**다. 시간표 데이터를 HTML에 박아 같이 CDN에 캐시하던 현재 방식보다 한 발 뒤로 가는 셈.

---

## 5. 결론

| | 패턴 A | 패턴 B | 패턴 C |
|---|---|---|---|
| 정적 캐싱 복구 | ✅ | ⚠️ 단독 불가 | ✅ |
| PIN 변경 즉시 무효화 (`cookies.md §6`) | ✅ | ❌ | ✅ |
| RSC 구조 유지 | ✅ | ✅ | ❌ |
| 첫 화면 UX | 즉시 | 즉시 | 스피너 대기 |
| 구현 난이도 | 낮음 | — | 높음 |

**패턴 A가 유일하게 성립하는 해결책**이다. proxy의 역할을 `/admin` 가드로 축소하고, `/`는 "정적 쉘 + nested Server Component로 인증 격리" 구조로 재정리한다. `cookies.md §8`이 정리한 "proxy는 최후의 수단, Server Components로 대체하라"는 Next.js 팀 권장 방향과도 일치한다.

---

## 6. 자주 헷갈리는 포인트

### "SessionTabs가 매번 API를 호출하는 거 아니야?"

아니다. `SessionTabs`는 props로 받기만 한다. API 호출은 부모 `page.tsx`(Server Component)가 하고, 그게 proxy 때문에 동적으로 판정되어 매번 재실행되는 것.

### "쿠키 검증을 클라이언트로 빼야 하나?"

절대 아니다. 쿠키값을 Upstash와 비교하는 로직은 서버에서만 돈다. "분리한다"는 말은 **같은 서버 안에서 nested Server Component로 쪼갠다**는 뜻이지 클라/서버 경계를 옮긴다는 뜻이 아니다.

### "Suspense는 로딩 스피너용 아닌가?"

용도가 여러 개다. 패턴 A에서는 **Next.js 빌드 타임에게 "이 경계 안쪽만 요청 시점에 실행해도 된다"고 알리는 표지판** 역할. fallback UI는 부수 효과일 뿐, 핵심은 동적/정적 경계 설정이다.

### "패턴 B의 matcher로 Upstash 값까지 비교할 수는 없나?"

없다. matcher 조건은 정적 설정이라 "쿠키 유무", "경로 패턴", "헤더 존재" 같은 표면 정보만 본다. 동적 비교(DB/KV 조회)는 proxy 본문 또는 서버 컴포넌트에서만 가능하고, 그 순간 정적 캐싱은 끝난다.

### "패턴 C도 `/api/timetable`을 캐싱하면 되는 거 아닌가?"

Route Handler 응답을 `Cache-Control`이나 `unstable_cache` 등으로 캐시할 수는 있다. 다만 그렇게 해도 "빈 HTML → JS 실행 → fetch → 렌더" 순서는 그대로라 **첫 화면 UX 문제는 안 풀린다**. RSC가 해결했던 "HTML에 데이터 박아 보내기"를 되살릴 수는 없다.

### "쿠키 검증을 서버로 옮긴 덕분에 캐싱이 된 거 아닌가?"

틀렸다. **쿠키 검증은 AS-IS에도 이미 서버에서 돌고 있었다** — `proxy.ts`는 클라가 아니라 서버 미들웨어다. 서버/클라이언트 경계를 옮긴 게 아니고, **서버 스택 안에서의 위치**(미들웨어 계층 → 페이지 트리 안의 nested Server Component)를 옮긴 것.

왜 그 이동이 캐싱을 살리는가:
- 미들웨어 매처에 `/`가 걸려 있으면 Next.js는 `/` 전체를 "요청마다 달라질 수 있는 경로"로 판정 → 페이지 전체가 `ƒ`.
- 같은 쿠키 비교 로직을 **페이지 트리 안쪽**으로 내리고 `<Suspense>`로 격리하면, Next.js는 "바깥 쉘은 정적 prerender, 안쪽만 요청 시점 실행"으로 판정 → `◐`.

동일한 서버 로직이지만 **어느 계층에서 실행되느냐**에 따라 Next.js의 정적/동적 판정이 갈린다.

### "Suspense는 캐시 무효화(revalidateTag) 때 병렬 렌더링하려고 쓰는 거 아닌가?"

아니다. Suspense는 **캐시 무효화와 무관**하고, **매 요청마다** 동작한다.

- 캐시가 fresh하든 stale이든 관계없이, 학생이 접속할 때마다 Suspense 안쪽 `AuthGate`는 돈다 — 이 사용자의 쿠키가 유효한지 매번 확인해야 하니까.
- 병렬 스트리밍은 "Suspense 경계가 여럿일 때 각자 독립적으로 렌더링되는" 부수 효과일 뿐, Suspense의 목적이 아니다.
- 목적은 한 줄: **"이 안쪽은 요청 시점 API를 쓰니 프리렌더하지 말고, 바깥은 정적으로 프리렌더해라"** 라고 Next.js에 알리는 경계 표지판.

무효화(`revalidateTag`)는 별개의 메커니즘이다 — **캐시된 쉘 HTML 자체를 새 걸로 갈아 끼우는** 트리거. Suspense는 그 쉘에 뚫려 있는 구멍의 위치를 선언할 뿐, 쉘을 언제 교체할지와는 관계없다.
