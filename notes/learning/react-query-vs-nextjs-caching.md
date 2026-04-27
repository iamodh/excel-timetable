# React Query 캐싱 vs Next.js 캐싱

같은 "stale-while-revalidate"라는 단어를 쓰지만 두 도구가 푸는 문제는 다르다. 이 문서는 **저장 위치·공유 범위·캐시 대상**의 차이를 정리하고, 왜 이 프로젝트가 React Query를 쓰지 않는지 설명한다.

---

## 1. 가장 큰 차이는 "누가 어디에 저장하느냐"

| 축 | React Query (CSR) | Next.js (App Router) |
|----|-------------------|----------------------|
| **저장 위치** | 브라우저 메모리 | 서버 메모리 + CDN 엣지 |
| **공유 범위** | 사용자 한 명, 한 탭 | 모든 사용자 공유 |
| **캐시 대상** | API 응답 데이터(JSON)만 | HTML + RSC payload + fetch 결과 |
| **fetch 주체** | 클라이언트 (브라우저가 직접 호출) | 서버 (사용자는 결과만 받음) |
| **캐시 키** | `queryKey` 수동 정의 | URL/함수 시그니처 자동 + `cacheTag` |
| **무효화** | `invalidateQueries()` (클라이언트) | `revalidateTag()` / `revalidatePath()` (서버) |

저장 위치가 다르다는 건 **사용자수와 API 호출수의 관계가 다르다**는 뜻이다.

---

## 2. 사용자 100명이 같은 콘텐츠를 본다면

```
[React Query 모델]
사용자1 브라우저 ──fetch──> Sheets API
사용자2 브라우저 ──fetch──> Sheets API
...
사용자100 브라우저 ──fetch──> Sheets API
→ API 호출 100번 (캐시는 각 브라우저에 따로따로)

[Next.js 모델]
사용자1 ──> CDN 엣지 (캐시 hit) ── HTML 즉시
사용자2 ──> CDN 엣지 (캐시 hit) ── HTML 즉시
...
사용자100 ──> CDN 엣지 (캐시 hit) ── HTML 즉시
→ API 호출 0번 (무효화 후 첫 요청 1번만)
```

직관: **React Query는 "각 사용자가 같은 fetch를 반복하지 않는다"**, **Next.js는 "API를 모든 사용자 대신 한 번만 부른다"**. 디커플링되는 축이 다르다.

---

## 3. 첫 화면이 그려지는 시점도 다르다

### React Query (전형적인 CSR + 데이터 페칭)
```
빈 HTML 도착
  → JS 번들 다운로드
  → React 마운트
  → useQuery 발동
  → fetch → 응답 도착
  → 렌더링
```
사용자는 모든 단계를 기다린다. 첫 페인트 시점에 콘텐츠가 없다.

### Next.js (RSC + Cache Components)
```
CDN에서 이미 데이터로 채워진 HTML 도착
  → 첫 페인트부터 콘텐츠 보임
  → JS 번들은 백그라운드에서 hydration용으로 로드
```
서버 컴포넌트가 빌드/revalidate 시점에 fetch까지 끝내고 HTML을 직렬화해 CDN에 올려두기 때문.

---

## 4. SWR이라는 단어가 양쪽에서 다른 의미

같은 용어를 쓰지만 **누구의 캐시인지**가 다르다.

| | React Query의 SWR | Next.js의 SWR |
|---|-------------------|---------------|
| 캐시 주체 | 사용자 한 명의 브라우저 | 서버 + 전 세계 CDN 엣지 |
| stale 응답 대상 | 그 사용자가 다시 같은 쿼리 트리거할 때 | 무효화 직후 **누구든 첫 요청자** |
| 백그라운드 갱신 | 그 브라우저가 fetch | 서버가 fetch, 결과를 모든 엣지에 전파 |
| 다른 사용자 영향 | 없음 (사용자별 격리) | 두 번째 요청자부터 모두 새 값 |

→ Next 쪽이 비용 효율 압도적. 단 모든 사용자에게 같은 콘텐츠일 때만 성립.

---

## 5. 그럼 React Query는 죽었나 — 아니다

서로 다른 축을 다룬다. 다음 케이스에서는 React Query(또는 SWR 라이브러리)가 여전히 자연스럽다:

| 케이스 | 적합한 도구 | 이유 |
|--------|-------------|------|
| 모든 사용자에게 같은 콘텐츠 (시간표, 블로그, 카탈로그) | **Next.js 캐싱** | 단일 캐시 공유 가능 |
| 사용자별 데이터 (내 프로필, 장바구니) | RSC도 가능 (`cookies()` + Suspense 격리) | 동적 홀로 처리 |
| 클라이언트 mutation 후 낙관적 업데이트 | **React Query** | 클라이언트 상태 관리가 본업 |
| 실시간성/폴링 (댓글 카운트, 알림) | **React Query** | `refetchInterval`, focus 갱신 등 내장 |
| 무한 스크롤, 페이지네이션 캐시 | **React Query** | `useInfiniteQuery` 같은 패턴 |

둘은 배타가 아니라 **레이어가 다르다**: Next로 정적/공유 콘텐츠를 처리하면서, 사용자별 인터랙션은 React Query로 얹는 조합도 가능.

---

## 6. 인증된 콘텐츠에서 갈리는 경험

- **React Query**: 자연스럽다. 각 사용자가 자기 토큰으로 fetch → 자기 캐시에 저장. 격리는 공짜.
- **Next.js**: 까다롭다. `cookies()`/`headers()` 같은 request-time API는 `"use cache"` 안에서 못 부른다. 인증된 부분을 **Suspense 홀로 격리**하고 정적 쉘과 분리해야 한다 (`shell-and-hole.md` 참조).

→ "사용자별 데이터 비중이 크다"면 React Query 쪽이 모델이 더 단순. "공유 콘텐츠 비중이 크다"면 Next 쪽이 압도적으로 효율적.

---

## 7. 이 프로젝트가 React Query를 안 쓰는 이유

- 시간표는 모든 학생에게 **같은 데이터** (PIN 인증은 접근 제어일 뿐, 콘텐츠는 동일)
- 진실원이 매니저 시트로 명시적이고, 무효화 트리거(관리자 "최신화" 버튼)도 명시적
- 따라서 **서버/CDN 단일 캐시 + on-demand 무효화**가 가장 단순하면서 비용 효율 최대
- 클라이언트에서 사용자별 mutation, 실시간 갱신 같은 요구가 없음

추후 "수업 출석 체크 / 좋아요 / 실시간 댓글" 같은 사용자별 인터랙션이 추가되면 그 영역만 React Query를 얹는 게 자연스러운 경로.

---

## 8. 직관 한 줄 요약

> **React Query** = "이 브라우저가 같은 fetch를 반복하지 않게 한다"
>
> **Next.js 캐싱** = "이 API를 모든 사용자 대신 한 번만 부른다"

저장 위치를 바꾸면 캐시의 의미·범위·비용 모델이 통째로 바뀐다.

---

## 9. 관련 문서

- `nextjs-rendering-and-cdn.md` — 옛날 React 데이터 페칭 패턴(useEffect, React Query)이 풀던 문제와 RSC가 그걸 어떻게 다르게 푸는지
- `stale-while-revalidate.md` — Next.js 쪽 SWR 사이클 상세 (fresh/stale/expired)
- `shell-and-hole.md` — 인증 같은 사용자별 동적 값을 RSC에서 어떻게 격리하는지
