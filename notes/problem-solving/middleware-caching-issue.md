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
| 미들웨어에서 `/` 제외 | 인증을 서버 컴포넌트 내부에서 처리하고 리다이렉트 | ✅ (전체 캐싱) |

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

### TO-BE (미들웨어 문제 해결 후 — 캐싱 정상 적용)

```
학생 접속 → Vercel Edge (CDN) → 캐싱된 HTML 즉시 반환 (API 호출 없음)
```

- 학생 10명이든 1000명이든 → API 호출 0번 (캐시 응답)
- API 호출은 관리자가 "시간표 최신화" 버튼을 누를 때 **1번만** 발생
- 페이지 이동 후 돌아와도 CDN 캐시에서 즉시 응답 → 로딩 빠름
- API 할당량 걱정 없음

### 비교 요약

| | AS-IS | TO-BE |
|---|---|---|
| 학생 100명 접속 시 API 호출 | 100번 | 0번 |
| 페이지 복귀 시 로딩 | 느림 (API 왕복 대기) | 즉시 (CDN 캐시) |
| API 할당량 초과 위험 | 있음 | 없음 |
| 데이터 갱신 시점 | 매 요청 (불필요하게 잦음) | 관리자 버튼 클릭 시만 |

---

## 공식 동작 확인 (조사 결과)

- **쿠키/헤더는 "Request-time API"**. 미들웨어나 페이지/레이아웃에서 읽는 순간 해당 경로는 동적 렌더링으로 강제된다. 페이지에 `revalidate = false`를 선언해도 미들웨어 매처에 걸린 경로에서는 이 설정이 효력을 잃는다.
- **미들웨어는 자기 자신을 opt-out 할 수 없다**. 미들웨어 본문이 실행되는 시점에는 Next.js가 이미 그 경로를 "요청마다 달라질 수 있음"으로 판정한 상태다. 따라서 미들웨어 내부에서 "쿠키 있으면 건너뛰기" 같은 early-return을 해도 정적 캐싱은 돌아오지 않는다.
- **Next.js 16부터 `middleware`는 `proxy`로 리네임**됐다 (이 프로젝트도 `proxy.ts` 사용 중). 단, 이름만 바뀌었을 뿐 캐싱에 미치는 영향은 동일하다.
- **Next.js 16에서는 캐싱이 opt-in (`use cache`)으로 뒤집혔다**. 이 프로젝트는 "정적 기본 + on-demand revalidate" 모델을 따르므로, 미들웨어로 인한 동적화가 치명적이다.

## 해결 패턴 비교

| 패턴 | 방식 | 장점 | 단점 |
|------|------|------|------|
| **A. matcher에서 `/` 제외** | `proxy.ts`의 `config.matcher`에서 `/`를 빼고, `app/page.tsx`에서 서버 컴포넌트로 쿠키 확인 → `redirect('/pin')`. 단, 쿠키 확인은 **nested Server Component + Suspense**로 격리하여 정적 쉘은 유지한다. | 페이지 전체 정적 캐싱 가능. 구조 변경 최소. | 인증되지 않은 사용자도 먼저 정적 HTML을 빌드/캐시하게 되나, 어차피 redirect라 체감 영향 적음. |
| **B. matcher `has` 조건** | `matcher: [{ source: "/", missing: [{ type: "cookie", key: "student_pin" }] }]` 로 **쿠키가 없는 요청만 미들웨어를 타게** 한다. | 인증된 사용자 요청은 미들웨어를 아예 건너뛰므로 정적 캐시 적중 가능. 매처 조건만 바꾸면 됨. | 매처의 `has`/`missing`이 Next.js 버전별로 정적 판정에 어떻게 반영되는지 실측 필요. 쿠키 존재 ≠ 유효한 PIN이라 여전히 서버 컴포넌트에서 재검증해야 함. |
| **C. 정적 쉘 + 클라이언트 fetch** | `/`는 완전 정적 HTML, 시간표 데이터는 Route Handler(`/api/timetable`)에서 클라이언트가 가져온다. | 가장 명확한 캐싱 경계. Route Handler는 본래 per-request라 쿠키 검증이 자연스러움. | SSR → CSR 전환으로 초기 로딩 UX 저하. 현재 서버 컴포넌트 구조 대폭 재작성. |

## 이 프로젝트에 권장되는 선택

**패턴 A (matcher에서 `/` 제외 + nested cookies + Suspense)** 가 가장 현실적이다.

근거:
- 현재 구조(서버 컴포넌트에서 Google Sheets 페칭 → HTML 렌더)를 유지할 수 있다.
- 시간표 데이터 자체는 모든 학생에게 동일 → 정적 쉘로 캐싱하기에 적합.
- 인증은 redirect만 필요하므로 nested 컴포넌트 하나로 격리 가능.
- 패턴 B는 "쿠키 존재 여부"만으로 우회 가능해 서버 컴포넌트에서 어차피 재검증이 필요하고, 실측 리스크가 있다.
- 패턴 C는 이득 대비 재작성 비용이 크다.

구현 스케치:
1. `proxy.ts` → `config.matcher`에서 `/` 제거 (`/admin`, `/api/*` 등만 유지)
2. `app/page.tsx` 내부에 `<AuthGate>` nested Server Component 추가
3. `<AuthGate>`에서 `cookies()` 호출 + PIN 불일치 시 `redirect('/pin')`
4. `<AuthGate>`를 `<Suspense>`로 감싸 정적 쉘 분리
5. 빌드 후 `ƒ /` → `○ /` 로 바뀌는지 확인

## 참고

- [Next.js cookies() API 레퍼런스](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [vercel/next.js Discussion #49708 — cookies/headers 동적화 범위 명확화](https://github.com/vercel/next.js/discussions/49708)
- [Next.js Middleware (proxy.js) 공식 문서](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Mastering Cookies in Next.js force-static Routes](https://www.buildwithmatija.com/blog/using-next-headers-cookies-in-a-force-static-route)
