# 미들웨어가 revalidate를 무효화하는 문제

## 발견한 현상

`app/page.tsx`에 `revalidate = false`를 설정했지만, 빌드 결과에서 `/`가 여전히 `ƒ (Dynamic)`으로 표시됨.

```
Route (app)
┌ ƒ /           ← 여전히 Dynamic
├ ○ /guide      ← Static
└ ○ /pin        ← Static

ƒ Proxy (Middleware)
```

## 원인

`proxy.ts`가 `/` 경로에 대해 미들웨어로 동작하며 `request.cookies`를 읽고 있었다.

```ts
// proxy.ts
export async function proxy(request: NextRequest) {
  const pin = request.cookies.get("student_pin")?.value  // ← 쿠키 읽기
  // ...
}

export const config = {
  matcher: ["/"],  // ← "/" 경로에 적용
}
```

미들웨어가 쿠키/헤더를 읽으면 Next.js는 해당 경로를 **사용자마다 다른 응답이 필요한 동적 경로**로 판단한다. `revalidate = false`를 설정해도 미들웨어가 이를 오버라이드한다.

## 해결 방향

| 방향 | 설명 | 캐싱 가능 여부 |
|------|------|---------------|
| 미들웨어 유지 + 클라이언트 fetch | 페이지는 정적 쉘만, 데이터는 클라이언트에서 API 호출 | ✅ (쉘만 캐싱) |
| 미들웨어에서 `/` 제외 | 인증을 서버 컴포넌트 내부에서 처리하고 시간표 데이터는 `"use cache"` 함수로 보호 | ✅ (데이터 함수 캐싱) |

> 정정: 이 문서의 초기 버전은 미들웨어를 제거하면 `/` HTML 전체가 정적/CDN 캐싱될 수 있다고 보았다. 실제 현재 구조에서는 `cookies()` 인증이 여전히 `/` 렌더 경로에 있으므로 HTML 전체 캐싱까지 보장하지 않는다. 핵심 보장 대상은 **Google Sheets API 호출 결과를 `getAllTimetableData()`의 `"use cache"`로 캐싱하는 것**이다.

## AS-IS / TO-BE

### AS-IS (현재 — 미들웨어가 캐싱을 막는 상태)

```
학생 접속 → 미들웨어(쿠키 확인) → 서버 컴포넌트 렌더링 → Google Sheets API 호출 → HTML 반환
```

- 학생 10명 접속 → API 10번 호출
- 학생 100명 접속 → API 100번 호출
- **학생 수 = API 호출 수** (매 요청이 동적 렌더링)
- 페이지 이동 후 돌아올 때마다 API 재호출 → 체감 로딩 느림
- Google Sheets API 할당량(분당 60회) 초과 위험

### TO-BE (미들웨어 문제 해결 후 — 데이터 캐싱 정상 적용)

```
학생 접속 → 서버 렌더링(쿠키 확인) → getAllTimetableData() 캐시 hit → HTML 반환
```

- 학생 10명이든 1000명이든 → Google Sheets API 호출 0번 가능 (데이터 함수 캐시 hit)
- API 호출은 관리자가 "시간표 최신화" 버튼을 누를 때 **1번만** 발생
- 페이지 HTML은 요청마다 렌더될 수 있지만, 가장 비싼 Google Sheets API 호출은 캐시로 보호
- API 할당량 걱정 없음

### 비교 요약

| | AS-IS | TO-BE |
|---|---|---|
| 학생 100명 접속 시 API 호출 | 100번 | 0번 가능 (`"use cache"` hit) |
| 페이지 복귀 시 로딩 | 느림 (API 왕복 대기) | 서버 렌더는 가능하지만 API 왕복은 생략 |
| API 할당량 초과 위험 | 있음 | 없음 |
| 데이터 갱신 시점 | 매 요청 (불필요하게 잦음) | 관리자 버튼 클릭 시만 |

---

## 공식 동작 확인 (조사 결과)

- **쿠키/헤더는 "Request-time API"**. 미들웨어나 페이지/레이아웃에서 읽는 순간 해당 경로는 동적 렌더링으로 강제된다. 페이지에 `revalidate = false`를 선언해도 미들웨어 매처에 걸린 경로에서는 이 설정이 효력을 잃는다.
- **미들웨어는 자기 자신을 opt-out 할 수 없다**. 미들웨어 본문이 실행되는 시점에는 Next.js가 이미 그 경로를 "요청마다 달라질 수 있음"으로 판정한 상태다. 따라서 미들웨어 내부에서 "쿠키 있으면 건너뛰기" 같은 early-return을 해도 정적 캐싱은 돌아오지 않는다.
- **Next.js 16부터 `middleware`는 `proxy`로 리네임**됐다 (이 프로젝트도 `proxy.ts` 사용 중). 단, 이름만 바뀌었을 뿐 캐싱에 미치는 영향은 동일하다.
- **Next.js 16에서는 캐싱이 opt-in (`use cache`)으로 뒤집혔다**. 따라서 route가 동적이어도, `"use cache"`가 붙은 데이터 함수 결과는 별도로 캐시될 수 있다.
- `cookies()`가 있는 route는 HTML 전체가 요청별 렌더 성격을 갖는다. 하지만 그 하위에서 호출하는 `getAllTimetableData()`는 `"use cache"` + `cacheTag("timetable")`로 보호되므로 Google Sheets API 호출은 매 요청 반복되지 않는다.
- 서버 컴포넌트에서 `redirect()`를 Suspense 안에서 던지면 dev 환경에서 RSC 스트림이 `Connection closed`로 보일 수 있다. 특히 인증 gate와 시간표 fetch subtree가 sibling Suspense로 나뉘면, 인증 실패 redirect와 시간표 fetch가 병렬로 시작되어 `VisibleSessionTabs [Prerender]` 쪽 오류가 난다.

## 해결 패턴 비교

| 패턴 | 방식 | 장점 | 단점 |
|------|------|------|------|
| **A. matcher에서 `/` 제외 + cached data function** | `proxy.ts`의 `config.matcher`에서 `/`를 빼고, `app/page.tsx`에서 서버 컴포넌트로 쿠키 확인. 시간표는 `getAllTimetableData()`의 `"use cache"`로 보호한다. | Google Sheets API 호출 수를 캐시 태그 단위로 제어. 서버 컴포넌트 구조 유지. 관리자 카테고리 라우트와 같은 모델. | HTML 전체 CDN 캐싱은 포기하거나 제한된다. 인증 실패 처리를 sibling Suspense로 나누면 RSC `Connection closed`가 날 수 있다. |
| **B. matcher `has` 조건** | `matcher: [{ source: "/", missing: [{ type: "cookie", key: "student_pin" }] }]` 로 **쿠키가 없는 요청만 미들웨어를 타게** 한다. | 인증된 사용자 요청은 미들웨어를 아예 건너뛰므로 정적 캐시 적중 가능. 매처 조건만 바꾸면 됨. | 매처의 `has`/`missing`이 Next.js 버전별로 정적 판정에 어떻게 반영되는지 실측 필요. 쿠키 존재 ≠ 유효한 PIN이라 여전히 서버 컴포넌트에서 재검증해야 함. |
| **C. 정적 쉘 + 클라이언트 fetch** | `/`는 완전 정적 HTML, 시간표 데이터는 Route Handler(`/api/timetable`)에서 클라이언트가 가져온다. | 가장 명확한 캐싱 경계. Route Handler는 본래 per-request라 쿠키 검증이 자연스러움. | SSR → CSR 전환으로 초기 로딩 UX 저하. 현재 서버 컴포넌트 구조 대폭 재작성. |

## 이 프로젝트에 권장되는 선택

**패턴 A (matcher에서 `/` 제외 + cached data function)** 가 가장 현실적이다.

근거:
- 현재 구조(서버 컴포넌트에서 Google Sheets 페칭 → HTML 렌더)를 유지할 수 있다.
- 시간표 데이터 자체는 모든 학생에게 동일 → `getAllTimetableData()`의 `"use cache"`로 캐싱하기에 적합.
- 인증은 렌더 진입 여부만 결정한다. 인증 실패 시에는 시간표 subtree가 시작되지 않도록 AuthGate가 children을 감싸야 한다.
- 패턴 B는 "쿠키 존재 여부"만으로 우회 가능해 서버 컴포넌트에서 어차피 재검증이 필요하고, 실측 리스크가 있다.
- 패턴 C는 이득 대비 재작성 비용이 크다.

최종 구현 스케치:
1. `proxy.ts` → `config.matcher`에서 `/` 제거 (`/admin`, `/api/*` 등만 유지)
2. `app/page.tsx`에서 `<Suspense>` 안에 `<AuthGate>` 배치 (`cookies()`는 Suspense 안에서 읽어 Next 16 blocking-route 오류를 피한다)
3. `<AuthGate>`가 `<NoticeBanner />`, `<VisibleSessionTabs />`, 가이드 링크를 children으로 감싼다
4. 인증 실패 시 AuthGate는 children을 렌더하지 않고 `/pin` 이동 컴포넌트를 반환한다. 서버 `redirect()`를 Suspense 안에서 던지면 dev RSC 스트림 오류가 날 수 있으므로 피한다.
5. `<VisibleSessionTabs>` 안에서 `getAllTimetableData()` 호출. 이 함수는 `"use cache"` + `cacheTag("timetable")`로 Google Sheets API 호출을 캐싱한다.

현재 구조:

```tsx
<Suspense fallback={<TimetableLoading />}>
  <AuthGate>
    <NoticeBanner />
    <VisibleSessionTabs />
    <GuideLink />
  </AuthGate>
</Suspense>
```

이 구조는 `/admin/categories`와 같은 캐싱 모델을 사용한다.

```txt
요청마다 인증/렌더는 실행될 수 있음
→ getAllTimetableData()는 "use cache"로 캐시 hit 가능
→ Google Sheets API는 관리자 최신화 후 첫 miss 때만 호출
```

## 잘못된 중간 시도

아래처럼 `AuthGate`와 `VisibleSessionTabs`를 sibling Suspense로 나누면 캐싱 경계는 좋아 보이지만 인증 실패 시 문제가 생긴다.

```tsx
<Suspense fallback={null}>
  <AuthGate />
</Suspense>

<Suspense fallback={<TimetableLoading />}>
  <VisibleSessionTabs />
</Suspense>
```

문제:
- React/Next가 두 Suspense subtree를 병렬로 시작할 수 있다.
- 인증 실패로 `AuthGate`가 redirect를 던지는 동안 `VisibleSessionTabs`도 `getAllTimetableData()`를 시작한다.
- redirect가 발생하면 현재 서버 컴포넌트 응답이 중단된다. 이때 sibling Suspense에서 동시에 렌더 중이던 `VisibleSessionTabs` 응답도 완료되지 못해 브라우저/dev overlay에 `Connection closed`가 표시된다.

결론적으로 `redirect()` 자체가 문제는 아니다. 문제는 `redirect()`와 sibling Suspense 구조가 결합되어, 인증 실패 상황에서도 시간표 fetch subtree가 병렬로 시작된 것이다. `AuthGate`가 시간표 subtree의 parent라면 인증 실패 시 children을 렌더하지 않으므로 `VisibleSessionTabs`가 시작되지 않는다.

따라서 인증 gate는 시간표 subtree의 sibling이 아니라 parent여야 한다.

## 참고

- [Next.js cookies() API 레퍼런스](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [vercel/next.js Discussion #49708 — cookies/headers 동적화 범위 명확화](https://github.com/vercel/next.js/discussions/49708)
- [Next.js Middleware (proxy.js) 공식 문서](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Mastering Cookies in Next.js force-static Routes](https://www.buildwithmatija.com/blog/using-next-headers-cookies-in-a-force-static-route)
