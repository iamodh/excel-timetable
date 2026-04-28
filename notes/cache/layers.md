# 캐시 레이어 분석 (M18 직전 기준)

이 문서는 `1531278` 커밋(M18 카테고리 합계 대시보드 구현 직전) 시점의 프로젝트 캐시 구조를 정리한 것이다. 현재 코드베이스가 어떤 캐시 레이어를 어디에 어떻게 두고 있는지를 한눈에 보기 위한 스냅샷.

---

## 1. 전제 설정 — Cache Components 모드

`next.config.ts`:

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
}
```

→ Next.js 16 **dynamic IO** 모델. 기본 동작은 동적이고, 캐시할 부분만 `"use cache"` 디렉티브로 명시한다. 페이지가 정적/동적 한쪽으로 자동 분류되지 않고, 함수·컴포넌트 단위로 cache hole을 판다.

자세한 비교는 `notes/learning/cache-components-on-off.md` 참조.

---

## 2. 서버 데이터 캐시 (`"use cache"` + `cacheTag`)

캐시되는 데이터 함수는 두 개뿐이다.

| 함수 | 위치 | 태그 | 데이터 소스 |
|------|------|------|-------------|
| `getAllTimetableData()` | `lib/sheets.ts:62` | `timetable` | Google Sheets API |
| `getNotice()` | `lib/notice.ts:15` | `notice` | Upstash Redis |

```ts
export async function getAllTimetableData(): Promise<TimetableData[]> {
  "use cache"
  cacheTag("timetable")
  const spreadsheet = await fetchTimetableData()
  return extractFirstTabSessions(spreadsheet)
}
```

`cacheLife`는 명시하지 않음 → default 프로파일. 무효화는 항상 태그 기반 on-demand로 처리한다.

### 캐시되지 않는 데이터 접근

같은 외부 시스템을 쓰지만 의도적으로 캐시하지 않는 경로:

- `getStoredPin()` (`lib/pin.ts:14`) — Redis 직접 호출, 매 요청 fresh
- `cookies()` 호출 — 인증 게이트가 dynamic이어야 함
- `verifyAdminToken()` — 환경변수 비교, 매 요청 평가

PIN과 인증 토큰은 보안상 캐시하면 안 되고, 둘 다 호출 빈도가 낮아서 캐시 이득도 없다.

---

## 3. 페이지 렌더 구조 — 정적 shell + 동적 hole

### 메인 페이지 (`app/page.tsx`)

```
TimetablePage  (정적 shell — 즉시 prerender)
├── <Suspense fallback={null}>          AuthGate
│       └─ cookies() + getStoredPin()         ← dynamic
├── <Suspense fallback={null}>          NoticeBanner
│       └─ getNotice()                        ← cached(notice)
└── <Suspense fallback={<Spinner/>}>    VisibleSessionTabs
        └─ getAllTimetableData()              ← cached(timetable)
```

- shell(레이아웃, 가이드 링크 등)은 prerender되어 첫 바이트로 즉시 흐른다
- 세 개의 Suspense hole이 각자 준비되는 대로 스트리밍
- 캐시 hit인 두 hole(notice, timetable)은 사실상 즉시 응답
- AuthGate hole만 매 요청 cookies + Redis 왕복

### 왜 세 개의 Suspense로 분리했나

세 hole을 하나로 묶거나 Suspense 없이 shell에 두는 대안 대비, 분리해야 하는 이유 세 가지.

#### 1. Cache Components가 강제하는 구조

`cacheComponents: true` 모델에서 shell은 **정적 prerender 가능**해야 한다. shell 안에는:

- `cookies()`, `headers()` 등 요청 의존 호출 ❌
- 캐시 안 된 async 호출 ❌
- 캐시된 `"use cache"` 호출도 await가 있으면 Suspense 안에 둬야 streaming 가능

`AuthGate`는 `cookies()` + `getStoredPin()` (uncached Redis), `VisibleSessionTabs`/`NoticeBanner`는 cached async 호출을 await한다. **세 컴포넌트 다 shell에 두면 페이지 전체가 dynamic으로 분류되어 prerender가 깨진다.**

→ Suspense로 감싸는 건 선택이 아니라 요구사항.

#### 2. Fallback UX가 각자 다르다

| Hole | fallback | 이유 |
|------|----------|------|
| `AuthGate` | `null` | 인증 게이트라 보일 게 없음. 미인증이면 redirect, 인증이면 사라짐 |
| `NoticeBanner` | `null` | 보조 정보. 늦게 떠도 시간표 보는 데 지장 없음 |
| `VisibleSessionTabs` | 스피너 | 메인 콘텐츠. 비어있으면 사용자가 "고장났나?" 함 |

하나의 Suspense로 묶으면 fallback이 하나여야 해서 셋 다 spinner거나 셋 다 null이 된다. 분리해야 각자 적절한 UX를 줄 수 있다.

#### 3. 독립 스트리밍

각 hole이 resolve되는 즉시 클라이언트로 흘려보낼 수 있다. 하나로 묶으면 가장 느린 놈이 끝날 때까지 다 기다린다.

```
분리:                          하나로 묶음:
shell ─────→ 도착             shell ─────→ 도착
  ├─ AuthGate (5ms) ──→ 도착    └─ [Suspense]
  ├─ Notice (cache hit) → 도착        ├─ AuthGate (5ms)
  └─ Sessions (1.5s) ──→ 도착         ├─ Notice
                                      └─ Sessions (1.5s)
                                              ↓
                                        모두 합쳐 1.5s 후 도착
```

`AuthGate`가 미인증으로 redirect하는 케이스에선 다른 hole들 작업이 일부 낭비되지만, AuthGate가 빨라서 영향이 작다.

### 관리자 페이지 (`app/admin/page.tsx`)

```
AdminPage
└── <Suspense fallback={null}>  AdminGate
        ├─ cookies() + ADMIN_PASSWORD 비교  ← dynamic
        └─ (인증 시) getNotice()            ← cached(notice)
```

쿠키 검사 자체가 dynamic이라 페이지 전체가 hole 안쪽에 들어간다.

---

## 4. Prerender 범위 — 두 캐시 레이어

`"use cache"` 함수가 있는 페이지의 prerender에는 **HTML뿐 아니라 데이터까지 포함**된다. 정확히는 두 레이어가 함께 작동한다.

### Data Cache — raw 데이터

`"use cache"` 함수의 **반환값**이 저장된다.

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

`"use cache"` 함수를 사용해서 그린 컴포넌트의 **출력**이 prerender 결과로 저장된다.

```tsx
async function VisibleSessionTabs() {
  const sessions = await getAllTimetableData()   // 데이터 캐시 소비
  return <SessionTabs sessions={sessions} />     // 이 결과가 prerender에 포함
}
```

→ `<SessionTabs sessions={[...]}>` 형태의 RSC payload (props에 `TimetableData[]`가 직렬화돼 들어있음)가 페이지 prerender에 baked in.

### 메인 페이지의 prerender 구성

```
[Static shell — HTML]
  레이아웃, 가이드 링크, Suspense 경계 마커

[NoticeBanner의 RSC payload]
  getNotice() 결과로 그려진 배너 (또는 null)
  ← 데이터 캐시(notice 태그)를 소비

[VisibleSessionTabs의 RSC payload]
  <SessionTabs sessions={[회차1, 회차2, ...]} /> 형태
  ← 데이터 캐시(timetable 태그)를 소비
  ← TimetableData[] 전체가 props로 직렬화

[AuthGate의 자리]
  fallback={null}만. 실제 출력은 요청마다 생성 (dynamic)
```

→ 시간표 데이터는 **두 군데에 있음**: 데이터 캐시의 원본 + Full Route Cache의 직렬화된 사본.

### 두 레이어가 함께 무효화

`revalidateTag("timetable", "max")` 한 번 호출이 둘 다 stale 마킹한다:

1. 데이터 캐시의 `timetable` 태그 entry → stale
2. 그 데이터를 소비한 컴포넌트가 포함된 Full Route Cache prerender → stale (자동 전파)

콘솔의 "prerendering..." 로그는 **둘 다 다시 만드는 작업** — Sheets API 호출 + 그 결과로 RSC payload 재생성.

### 캐시 hit 시 학생 새로고침 비용

prerender가 fresh일 때 학생이 새로고침하면:

- shell: Full Route Cache에서 즉시
- NoticeBanner RSC: Full Route Cache에서 즉시 (Redis 호출 0회)
- VisibleSessionTabs RSC: Full Route Cache에서 즉시 (Sheets 호출 0회)
- AuthGate: 매 요청 cookies + Redis 1회

→ **외부 API 호출은 AuthGate의 Redis 1회만**. Sheets는 관리자가 "최신화" 누른 직후 트리거된 백그라운드 prerender에서만 호출된다.

---

## 5. 무효화 경로 (write → invalidate)

| 트리거 | 엔드포인트 | 실행 | 영향 |
|--------|-----------|------|------|
| 관리자 "시간표 최신화" 버튼 | `POST /api/revalidate` | `revalidateTag("timetable", "max")` | `getAllTimetableData` 캐시 폐기 |
| 공지 등록 | `POST /api/notice` | `setNotice()` + `revalidateTag("notice", "max")` | `getNotice` 캐시 폐기 |
| 공지 삭제 | `DELETE /api/notice` | `deleteNotice()` + `revalidateTag("notice", "max")` | 동일 |
| PIN 변경 | `POST /api/pin` | `setStoredPin()` | **무효화 호출 없음** (PIN은 애초에 캐시 안 됨) |

`revalidateTag(tag, "max")`의 두 번째 인자는 Next 16의 cacheLife 프로파일 신호 — 즉시 폐기 + 우선 재생성. 자세한 설명은 `notes/problem-solving/use-cache-and-tags.md` 참조.

쓰기 흐름은 모두 관리자 액션 한 군데로만 통한다. 학생 측 read 경로는 캐시를 무효화할 권한이 없다.

---

## 6. 클라이언트(브라우저) 캐시

별도 설정 없이 Next.js 기본 동작을 쓴다.

**Router Cache (in-memory, 클라이언트)**
- `<Link>` 네비게이션, 뒤로가기/앞으로가기에서 RSC payload 재사용
- 새로고침(F5) 시 폐기
- 학생 페이지의 가이드 링크 왕복 정도에 적용됨

서버 측 Full Route Cache는 §4에서 다룸.

React Query, SWR 등 클라이언트 캐시 라이브러리는 없다. 클라이언트 컴포넌트는 props로 받은 서버 데이터를 그대로 쓰고, 변경은 fetch + `router.refresh()` 또는 로컬 state로 반영한다.

---

## 7. 명시적으로 사용하지 않은 것들

확장 가능성 검토를 위해 안 쓰는 것도 기록.

- `export const revalidate` / `export const dynamic` — 라우트 단위 캐시 설정 부재. 모두 함수 단위 `"use cache"`로 일원화.
- `unstable_cache()` — Cache Components와 혼용 안 함.
- `fetch(url, { next: { tags } })` — Google Sheets는 `googleapis` SDK로 호출하므로 적용 불가. SDK 호출을 감싼 함수에 `"use cache"`를 붙이는 패턴.
- HTTP `Cache-Control` 헤더 직접 조작 — 모두 Next 캐시 모델에 위임.
- 미들웨어 — 과거에 인증을 미들웨어로 처리하다 캐싱이 깨져서 제거. 자세한 내용은 `notes/problem-solving/middleware-caching-issue.md`.

---

## 8. 한 줄 요약

> 외부 데이터 두 개(`timetable`, `notice`)만 태그 기반 서버 캐시. 인증·PIN은 매 요청 fresh. 페이지는 정적 shell + Suspense hole 패턴으로 캐시된 부분과 동적 부분을 컴포넌트 단위로 섞고, prerender에는 HTML과 데이터(props 직렬화)가 함께 베이킹된다. 무효화는 관리자 액션 → `revalidateTag` 두 경로뿐.
