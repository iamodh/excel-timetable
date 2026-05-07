# 미들웨어가 `/` 라우트의 캐싱을 막는 문제

## 문제 상황

`app/page.tsx`에 `revalidate = false`를 설정했고 `getAllTimetableData()`에 `"use cache"`를 붙였는데도, 빌드 결과에서 `/`가 여전히 `ƒ (Dynamic)`으로 표시되고 학생이 새로고침할 때마다 Google Sheets API 호출이 발생했다.

```
Route (app)
┌ ƒ /           ← 여전히 Dynamic
├ ○ /guide      ← Static
└ ○ /pin        ← Static

ƒ Proxy (Middleware)
```

학생 100명이 동시에 접속하면 Sheets API도 100번 호출되어 분당 60회 quota를 초과했다.

## 원인

`proxy.ts`(Next.js 16에서 `middleware.ts`가 리네임된 파일)가 `/` 경로에서 `request.cookies`를 읽고 있었다.

```ts
export async function proxy(request: NextRequest) {
  const pin = request.cookies.get("student_pin")?.value
  // ...
}

export const config = {
  matcher: ["/"],
}
```

미들웨어가 쿠키/헤더 같은 Request-time API를 읽으면 Next.js는 해당 경로를 **사용자마다 다른 응답이 필요한 동적 경로**로 강제한다. 페이지에 `revalidate = false`를 선언해도 미들웨어 매처에 걸린 경로에서는 효력을 잃는다. 미들웨어 본문에서 early-return을 해도 결과는 같다 — 미들웨어 본문 실행 시점에는 이미 Next.js가 해당 경로를 동적으로 판정한 상태다.

## 해결 방법

1. `proxy.ts`의 `config.matcher`에서 `/` 제거. 다른 경로(`/admin` 등)만 남긴다.
2. 인증을 React tree 안의 `AuthGate` 서버 컴포넌트로 옮긴다. `cookies()` + Redis(저장 PIN) 비교를 여기서 수행한다.
3. `AuthGate`를 보호 대상의 **parent wrapper**로 둔다. sibling Suspense로 나란히 두면 인증 실패 redirect와 시간표 fetch가 동시에 시작되어 RSC stream이 끊긴다.
4. `getAllTimetableData()`는 `"use cache"` + `cacheTag("timetable")`를 유지한다. 라우트가 동적이어도 이 데이터 함수의 반환값은 별도 Data Cache에 저장된다.

```tsx
<Suspense fallback={<TimetableLoading />}>
  <AuthGate>
    <NoticeBanner />
    <VisibleSessionTabs />
    <GuideLink />
  </AuthGate>
</Suspense>
```

`AuthGate`는 인증 실패 시 children을 렌더하지 않고 `PinRedirect` 같은 클라이언트 이동 컴포넌트를 반환한다. 서버 `redirect()`를 던지지 않는다.

여기서 `<Suspense>`는 fallback UI 도구가 아니라 Next.js에 "이 안쪽은 요청 시점에 실행하는 동적 경계"라고 선언하는 **표지판**이다. fallback은 부수 효과일 뿐, 핵심 역할은 동적/정적 경계 선언. Suspense 없이 페이지 본문에서 `cookies()`가 호출되면 그 선언이 페이지 전체로 번져 정적 prerender가 깨진다.

### 검토했지만 채택하지 않은 패턴

- **proxy matcher의 `missing` 조건** — `matcher: [{ source: "/", missing: [{ type: "cookie", key: "student_pin" }] }]` 로 쿠키가 없는 요청만 미들웨어를 타게 한다. 단순히 "쿠키 존재 여부"만으로 우회되어 관리자가 PIN을 변경해도 기존 세션이 즉시 무효화되지 않는다 (PIN 변경 즉시 무효화 보안 설계 파괴). 결국 페이지 내부에서 Upstash 재검증이 필요하므로 채택안과 동일해진다.
- **정적 쉘 + 클라이언트 fetch** — `/`를 빈 HTML로 만들고 시간표를 클라이언트에서 `fetch('/api/timetable')`로 가져온다. CDN 캐싱은 살지만 RSC가 해결한 "HTML에 데이터 박아 보내기"를 포기 — 첫 화면 공백 + `useEffect` + 3-state 부활. 카카오톡 인앱 브라우저 등 느린 환경에서 UX 손해가 큼.

## 결과

- 학생 N명이 새로고침해도 Sheets API 호출은 무효화 후 첫 요청 1번만 발생한다. 이후는 Data Cache hit.
- 페이지 본문은 여전히 매 요청 실행(쿠키 검사 때문)되지만, 정적 쉘은 prerender되고 가장 비싼 외부 호출은 캐시로 보호된다.
- 시트 갱신은 관리자가 `/api/revalidate` 엔드포인트로 `revalidateTag("timetable", "max")`를 호출할 때 stale 마킹 → 다음 학생 요청은 stale 즉시 응답 + 백그라운드에서 새 데이터 fetch (학생은 로딩 대기 없음).
- Sheets API quota 초과 위험 해소.

### 빌드 출력으로 검증

`next build`의 라우트 심볼로 캐싱 구조를 확인할 수 있다.

| 심볼 | 의미 |
|------|------|
| `○` | 완전 정적 (페이지 전체가 쉘) |
| `◐` | Partial Prerender (정적 쉘 + 동적 홀) |
| `ƒ` | 완전 동적 (쉘 없음, 매 요청 전체 렌더) |

미들웨어가 `/`에 걸려 있던 상태는 `ƒ /`로 표시됐다. 매처에서 제거하고 동적 로직(`AuthGate`의 `cookies()`)을 `<Suspense>` 안에 격리하면 `◐ /`로 바뀐다. 해결 후에도 `ƒ`로 떨어졌다면 쉘 영역에 동적 값이 새어나간 것 — 누락된 Suspense 경계를 찾아야 한다.
