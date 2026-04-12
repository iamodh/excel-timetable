# revalidate 설정과 미들웨어의 관계

## 서버 컴포넌트의 동적/정적 렌더링

Next.js App Router에서 서버 컴포넌트(페이지)는 기본적으로 **async 데이터 페칭이 있으면 동적 렌더링**으로 처리된다.

```tsx
// 매 요청마다 Google Sheets API 호출 → 동적 렌더링
export default async function Page() {
  const data = await getAllTimetableData()
  return <Grid data={data} />
}
```

### `revalidate` 설정으로 정적 캐싱 적용

```tsx
export const revalidate = false  // 자동 갱신 안 함 (on-demand만 허용)
// export const revalidate = 60  // 60초마다 자동 갱신
```

- `revalidate = false` — 빌드/첫 요청 시 1번 렌더링, 이후 `revalidatePath()` 호출 시에만 갱신
- `revalidate = 60` — 60초마다 백그라운드에서 재생성
- 설정 없음 — async 데이터 페칭이 있으면 매 요청마다 렌더링 (동적)

### 클라이언트 컴포넌트와는 무관

서버 컴포넌트가 클라이언트 컴포넌트에 props로 데이터를 전달해도, 동적/정적 결정은 **서버 컴포넌트(페이지) 레벨**에서 이루어진다. 클라이언트 컴포넌트는 이 결정에 영향을 주지 않는다.

## 개발 모드 vs 프로덕션 모드

- `npm run dev` — 개발 모드. `revalidate` 설정 무시, 매 요청마다 새로 렌더링
- `npm run build && npm start` — 프로덕션 모드. `revalidate` 설정 적용

캐싱 동작을 확인하려면 반드시 프로덕션 빌드로 테스트해야 한다.

## 로딩이 느린 근본 원인

서버 성능이 아니라 **네트워크 왕복(round trip)** 때문.

```
브라우저 → Vercel 서버 → Google Sheets API → 응답 파싱 → HTML 반환
```

캐싱이 적용되면:

```
브라우저 → Vercel Edge (CDN) → 캐싱된 HTML 즉시 반환 (API 호출 없음)
```
