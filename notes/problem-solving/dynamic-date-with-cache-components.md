# `new Date()`를 `cacheComponents` 페이지에 끼워넣기 — 2단계 에러와 해결

M16 "미래 회차 필터" 배선 중에 발생한 사례. `filterVisibleSessions(sessions, new Date())`를 `app/page.tsx`에 붙였더니 두 번 연속 다른 에러가 나왔다. 원인은 같은 축 — "`cacheComponents` 모드에서 동적 값을 어디에 두느냐" — 이고, 해결은 기존 `AuthGate` 패턴(`proxy-caching-patterns.md §2` 패턴 A)을 새 의존성에 그대로 재적용한 것.

---

## 1. 배경

- `lib/session.ts`의 `filterVisibleSessions()`는 M16 유닛 테스트까지 완료된 상태였지만 **어디에서도 호출되지 않고** 있었다 (lib 함수만 존재, UI 미배선).
- `PLAN.md` M16 체크리스트 중 "탭 버튼은 현재 회차까지만 렌더링"이 `[ ]` 상태.
- 작업: `app/page.tsx`에서 `getAllTimetableData()` 결과를 `filterVisibleSessions(..., new Date())`로 필터링 후 `SessionTabs`에 전달.

이 프로젝트의 전제:
- `next.config.ts`에 `cacheComponents: true` 활성화됨 (→ `use-cache-and-tags.md §1`)
- `getAllTimetableData()`는 `"use cache"` + `cacheTag("timetable")`로 캐시됨
- 이미 `AuthGate`가 `cookies()` 때문에 Suspense로 격리되어 있음 (→ `proxy-caching-patterns.md §2`)

---

## 2. 1차 시도 — 페이지 본문에 직접 `new Date()`

```tsx
// app/page.tsx
export default async function TimetablePage() {
  const [allSessions, notice] = await Promise.all([
    getAllTimetableData(),
    getNotice(),
  ])
  const sessions = filterVisibleSessions(allSessions, new Date())  // ← 문제
  return (
    <div>
      ...
      <Suspense><SessionTabs sessions={sessions} /></Suspense>
      ...
    </div>
  )
}
```

### 에러

```
Route "/" used `new Date()` before accessing either uncached data
(e.g. `fetch()`) or Request data (e.g. `cookies()`, `headers()`,
`connection()`, and `searchParams`). Accessing the current time in
a Server Component requires reading one of these data sources first.
```

### 원인

`cacheComponents` 모델은 페이지를 prerender 시도한다. Prerender는 "시점 무관하게 같은 결과"를 전제로 하는데 `new Date()`는 호출 시점에 의존 → 빌드 시점에 얼려서 CDN에 저장하면 "오늘"이 빌드 날짜로 고정되는 부정합 발생.

Next.js는 이 부정합을 막으려고 `new Date()` 호출 지점을 감지하고, **"이 렌더가 요청 시점임을 먼저 선언하라"** 고 요구한다. 선언 수단: `connection()`, `cookies()`, `headers()`, `searchParams`, 또는 uncached `fetch()` 중 하나를 먼저 호출.

`getAllTimetableData()`는 `"use cache"`라 uncached가 아니고, `getNotice()`도 같음. 페이지 본문에 동적 표식이 전혀 없으니 Next.js가 거부.

---

## 3. 2차 시도 — 페이지 함수 최상단에 `await connection()`

```tsx
import { connection } from "next/server"

export default async function TimetablePage() {
  await connection()                                         // ← 추가
  const [allSessions, notice] = await Promise.all([...])
  const sessions = filterVisibleSessions(allSessions, new Date())
  return <div>...</div>
}
```

### 에러

```
Route "/": Uncached data or `connection()` was accessed outside of
`<Suspense>`. This delays the entire page from rendering, resulting
in a slow user experience.
```

### 원인

`connection()`은 "이 렌더는 요청 시점" 을 선언하는 API지만, **페이지 함수 루트에서 호출**하면 그 선언이 페이지 전체(= 쉘)에 번진다. `cacheComponents` 모드의 핵심은 "쉘은 prerender, 홀만 dynamic"인데 쉘 자체를 dynamic으로 만들어버려 CDN에 얼려둘 수 있는 조각이 사라진다.

Next.js는 이 낭비를 막으려고 "Suspense 바깥에서 `connection()` 호출 금지"를 강제한다. 즉 동적 선언은 **반드시 Suspense 경계 안쪽**에서 이루어져야 한다 (→ `learning/rendering/04-shell-and-hole.md §3`).

---

## 4. 3차 시도 (완료) — Nested Server Component + Suspense

```tsx
// app/page.tsx
async function VisibleSessionTabs() {
  await connection()
  const allSessions = await getAllTimetableData()
  const sessions = filterVisibleSessions(allSessions, new Date())
  return <SessionTabs sessions={sessions} />
}

async function NoticeBanner() {
  const notice = await getNotice()
  if (!notice) return null
  return <div>...{notice}...</div>
}

export default function TimetablePage() {
  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <Suspense fallback={null}><AuthGate /></Suspense>
      <Suspense fallback={null}><NoticeBanner /></Suspense>
      <Suspense fallback={null}><VisibleSessionTabs /></Suspense>
      <Link href="/guide">가이드</Link>
    </div>
  )
}
```

### 변화 요약

- **페이지 함수 자체는 동기**가 됨 (쉘로서 prerender 가능)
- 동적 로직(`connection()` + `new Date()`)은 `VisibleSessionTabs`라는 자식 Server Component로 이동
- 공지 배너도 `NoticeBanner`로 분리해 독립 스트리밍 단위로 승격
- 각 동적 조각은 자기 `<Suspense>` 경계 안에 위치

### 왜 동작하는가

- 쉘: `<div>`, 3개의 Suspense placeholder, 가이드 Link — 동적 값 없음 → prerender 가능 → CDN에 얼려짐
- `VisibleSessionTabs` 홀: `connection()`이 "이 안쪽은 요청 시점"을 선언. Suspense 경계 안이라 선언이 쉘로 번지지 않음. 안에서 호출한 `getAllTimetableData()`는 `"use cache"`라 여전히 캐시 hit.

---

## 5. 과거 `AuthGate` 분리와의 관계

겉보기엔 비슷해 보이지만 **분리의 축이 다르다**.

| | `AuthGate` 분리 (과거) | `VisibleSessionTabs` 분리 (이번) |
|---|---|---|
| 분리 전 문제 | `cookies()`가 페이지 전체를 dynamic으로 오염 → 페이지 내 `getAllTimetableData()`가 매 요청마다 재실행 → **Sheets API 호출 폭발** | `new Date()`가 prerender와 충돌 → 빌드/런타임 에러 |
| 분리의 축 | 캐시 경계 (캐시 히트 복구) | Prerender 경계 (쉘 prerender 복구) |
| 얻은 것 | Sheets API 호출 횟수 감소 | 에러 해소 + 쉘 CDN 캐시 유지 |

오늘 문제는 **Sheets API 호출과 무관**했다. `"use cache"`가 함수 레벨에서 이미 API 호출을 0회로 묶어둔 덕분. 함수 레벨 캐시와 prerender 경계는 독립 축이라는 점이 핵심 (→ `learning/rendering/04-shell-and-hole.md §5`).

---

## 6. 에러 해석 치트시트

| 에러 메시지 | 의미 | 해결 |
|-------------|------|------|
| `used new Date() before accessing... uncached data or Request data` | 동적 값을 썼는데 "이 렌더는 요청 시점"을 선언 안 함 | `connection()` / `cookies()` / `headers()` 중 하나를 먼저 호출 |
| `Uncached data or connection() was accessed outside of <Suspense>` | 동적 선언이 Suspense 바깥이라 쉘 전체가 blocking | 동적 조각을 nested Server Component로 추출해 Suspense로 감쌈 |
| `Accessing Dynamic data sources inside a cache scope is not supported` | `"use cache"` 함수 안에서 `cookies()`/`new Date()` 등 호출 | `"use cache"` 함수를 데이터 페칭만 담당하게 좁히고, 동적 로직은 바깥 Server Component로 |

---

## 7. 다음에 새 동적 의존성을 추가할 때

이 프로젝트에서 **요청마다 달라지는 값**을 페이지에 끼울 일이 또 생기면 레시피는 고정:

1. 동적 값을 사용하는 조각을 **nested Server Component**로 뽑는다
2. 그 컴포넌트 함수 첫 줄에 `await connection()` (또는 `await cookies()`, `await headers()`) 추가
3. 호출부는 `<Suspense fallback={...}>`로 감싼다
4. 그 안에서 캐시된 함수(`"use cache"` 붙은 것)를 호출하는 건 그대로 OK — 캐시 hit은 독립적으로 유지됨

`AuthGate`와 `VisibleSessionTabs`가 같은 레시피로 만들어진 쌍둥이. 세 번째, 네 번째가 생겨도 동일 패턴을 반복하면 된다.

---

## 8. 관련 문서

- `learning/rendering/03-prerender-vs-dynamic.md` — 두 축(서버/클라이언트 × 정적/동적)의 개념
- `learning/rendering/04-shell-and-hole.md` — `cacheComponents` 쉘+홀 모델
- `use-cache-and-tags.md` — 함수 레벨 캐시 (`"use cache"` / `cacheTag`)
- `proxy-caching-patterns.md` — 원본이 된 "패턴 A" (AuthGate 분리 사례)
