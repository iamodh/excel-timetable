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
