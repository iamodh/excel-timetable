# 쉘과 홀 — 한 페이지에 정적/동적 섞기

`prerender-and-dynamic-rendering.md`가 "prerender와 dynamic은 직교하는 두 축"을 개념으로 설명했다면, 이 문서는 그 둘을 **한 페이지 안에서 섞는** 구체적 모델을 다룬다. Next.js 16의 `cacheComponents` 모드(= PPR의 후속)가 이 구조를 실현하는 기능이다.

---

## 1. 아이디어 — 페이지 하나를 둘로 쪼갠다

한 페이지 전체를 정적/동적 중 하나로 고르는 대신, **레이아웃/공통 부분은 얼려두고(쉘), 사용자·시간마다 달라지는 조각만 매번 다시 그린다(홀)**.

```
┌─ SHELL ──────────────────────────────────────┐
│  정적 레이아웃, 네비게이션, 공통 UI          │
│                                              │
│  ┌─ HOLE ─────────────────────────┐          │
│  │  요청마다 달라지는 조각        │          │
│  └────────────────────────────────┘          │
│                                              │
│  ┌─ HOLE ─────────────────────────┐          │
│  │  또 다른 동적 조각             │          │
│  └────────────────────────────────┘          │
└──────────────────────────────────────────────┘
```

- **쉘**: prerender됨. 빌드/revalidate 시점에 1회 직렬화되어 CDN에 얼려짐. 모든 사용자가 같은 바이트를 본다.
- **홀**: 쉘 안에 **뚫린 구멍**. 실제 내용은 비어 있고, 요청 시점에 서버가 렌더해 스트리밍으로 채운다.

---

## 2. Suspense = 홀 경계를 선언하는 표지판

`<Suspense>`는 "이 안쪽은 홀입니다"라고 Next.js에 알리는 마킹이다. 로딩 스피너 용도가 아니다 (fallback UI는 부수 효과).

```tsx
export default function Page() {
  return (
    <div>
      <h1>제목</h1>                      {/* 쉘 */}

      <Suspense fallback={null}>
        <DynamicPart />                  {/* 홀 */}
      </Suspense>

      <footer>푸터</footer>              {/* 쉘 */}
    </div>
  )
}
```

- `<h1>`, `<footer>`는 prerender되어 CDN에 저장
- `<DynamicPart />`는 요청 시점에 서버에서 실행. 쉘 HTML에는 "여기 나중에 채워짐"이라는 placeholder만 박힘
- 응답이 도착하면 스트리밍으로 placeholder를 덮어씀

---

## 3. 쉘의 prerender 가능성은 전염된다

쉘 영역(Suspense 바깥)에서 **동적 값**을 하나라도 쓰면 쉘 전체가 dynamic으로 판정되어 CDN에 얼려둘 수 있는 조각이 사라진다.

```tsx
// ❌ 쉘에 동적 값
export default async function Page() {
  const user = await cookies()            // 쉘에서 cookies() → 쉘 전체 dynamic
  return (
    <div>
      <h1>안녕 {user.name}</h1>
      <Suspense>...</Suspense>
    </div>
  )
}
```

`cacheComponents: true`는 이 케이스를 빌드 타임/런타임에 에러로 막는다:
- "`cookies()`/`headers()`/`connection()`/`new Date()` accessed outside of `<Suspense>`"
- "Uncached data accessed outside of `<Suspense>` — delays the entire page"

**해결**: 동적 값을 쓰는 조각을 **nested Server Component로 쪼개고 Suspense로 감싼다** (= 홀로 만든다).

```tsx
// ✅ 동적 조각을 홀로 격리
async function Greeting() {
  const user = await cookies()
  return <h1>안녕 {user.name}</h1>
}

export default function Page() {
  return (
    <div>
      <Suspense fallback={null}>
        <Greeting />
      </Suspense>
      <Suspense>...</Suspense>
    </div>
  )
}
```

---

## 4. 이 프로젝트의 구조 (`app/page.tsx`)

```tsx
export default function TimetablePage() {
  return (
    <div className="min-h-screen bg-zinc-50 p-4">        {/* 쉘 */}
      <Suspense fallback={null}>
        <AuthGate />                                     {/* 홀 1: cookies() */}
      </Suspense>

      <Suspense fallback={null}>
        <NoticeBanner />                                 {/* 홀 2: 캐시된 getNotice() */}
      </Suspense>

      <Suspense fallback={null}>
        <VisibleSessionTabs />                           {/* 홀 3: connection() + new Date() */}
      </Suspense>

      <Link href="/guide">가이드</Link>                 {/* 쉘 */}
    </div>
  )
}
```

각 홀이 독립적으로 의미가 있다:

| 홀 | 동적 이유 |
|----|----------|
| `AuthGate` | `cookies()` — 사용자별 쿠키 검증 + Upstash 비교 |
| `NoticeBanner` | `getNotice()` 자체는 캐시되어 있지만 독립 스트리밍 단위로 분리 |
| `VisibleSessionTabs` | `connection()` + `new Date()` — 오늘 날짜 기반 필터링 |

요청 흐름:

```
학생 접속
  → CDN이 쉘 HTML 즉시 반환 (Sheets API 호출 0회, TTFB 짧음)
     쉘에는 3개 홀 자리에 placeholder가 박혀 있음
  → 동시에 서버가 3개 홀을 병렬 렌더
     - AuthGate: 쿠키 + Upstash 비교 → HTML 조각
     - NoticeBanner: 캐시 hit → HTML 조각
     - VisibleSessionTabs: 캐시된 sessions + new Date() 필터 → HTML 조각
  → 각 조각이 스트리밍으로 내려와 자기 자리 placeholder를 덮어씀
```

---

## 5. 홀 경계와 캐시 경계는 다른 축이다

쉘/홀은 **prerender 경계**다. "이 조각은 CDN에 얼려둘 수 있는가"의 축.

캐시는 **함수 레벨 경계**다 (`"use cache"`). "이 함수의 리턴값을 저장해둘 수 있는가"의 축.

두 경계는 독립이다:

```tsx
async function VisibleSessionTabs() {
  await connection()                              // 동적 선언 (이 컴포넌트는 홀)
  const allSessions = await getAllTimetableData() // 함수는 "use cache" → 캐시 hit
  return <SessionTabs sessions={filterVisible(allSessions, new Date())} />
}
```

- 컴포넌트 레벨: dynamic (매 요청 실행)
- 함수 레벨: cached (Sheets API 호출 0회)

"동적 컴포넌트 안에서 캐시된 함수 호출"이 **정상 패턴**이다. 동적이라고 해서 I/O가 매 요청마다 일어나는 것이 아니다.

---

## 6. 빌드 출력으로 확인하기

`next build`의 라우트 심볼:

| 심볼 | 의미 |
|------|------|
| `○` | 완전 정적 (페이지 전체가 쉘) |
| `◐` | **Partial Prerender** (쉘 + 홀 혼합) |
| `ƒ` | 완전 동적 (쉘 없음, 매 요청 전체 렌더) |

```
┌ ◐ /                       15m      1y
├ ◐ /admin
```

`◐`이 떠야 "쉘은 CDN, 홀만 동적" 패턴이 성립한 것. `ƒ`로 떨어졌다면 쉘 영역에 동적 값이 새어나간 것이니 Suspense로 격리해야 한다.

---

## 7. 자주 헷갈리는 포인트

### "Suspense는 로딩 스피너 용도 아닌가"
부수 효과일 뿐. `cacheComponents` 모드에서 Suspense의 **주 용도는 prerender 경계 선언**이다. fallback을 `null`로 둬도 제 역할을 한다.

### "홀이 많으면 느려지지 않나"
홀들은 **병렬 스트리밍**된다. 쉘이 먼저 도착해 첫 화면이 즉시 그려지고, 각 홀은 준비되는 대로 독립적으로 채워진다. 홀이 여러 개여도 가장 느린 홀 하나만 기다리면 된다 (직렬 아님).

### "쉘 = 정적, 홀 = 동적 이라는 공식이 절대적인가"
대체로 맞지만 예외가 있다: 캐시된 함수만 호출하는 조각도 독립 스트리밍을 위해 홀로 뺄 수 있다 (이 프로젝트의 `NoticeBanner` 처럼). "dynamic 값"이 없어도 홀이 될 수 있다 — Suspense 경계의 본질은 "독립 렌더링 단위".

### "페이지 전체를 `"use cache"`로 감싸면 안 되나"
시도할 수 있지만, 페이지 트리에 동적 조각이 하나라도 있으면 충돌한다 (`use-cache-and-tags.md §2` 참조). 이 프로젝트도 처음엔 페이지에 `"use cache"`를 달았다가 `AuthGate`의 `cookies()`와 충돌해서 함수 레벨로 내렸다.

---

## 8. 관련 문서

- `prerender-and-dynamic-rendering.md` — 두 축의 개념 정리
- `problem-solving/use-cache-and-tags.md` — 함수 레벨 캐시 (cacheComponents와 짝)
- `problem-solving/proxy-caching-patterns.md` — Suspense를 "경계 표지판"으로 쓰는 원리 (패턴 A)
- `problem-solving/dynamic-date-with-cache-components.md` — 쉘에 동적 값 넣었다가 겪은 사례
