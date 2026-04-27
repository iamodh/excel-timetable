# 김해청년 시간표

Google Sheets 기반 교육 시간표 웹 뷰어. 관리자가 시트에서 시간표를 작성하면 학생들이 웹에서 열람합니다.

## 프로젝트 배경

기존에는 시간표 변경 시 "시트 수정 → 캡처 → 카카오톡 공유"가 필요했고, 학생은 단톡방에서 최신 이미지를 찾아 "이게 최신인가?"를 스스로 판단해야 했습니다. 이 프로젝트는 웹을 단일 진실원으로 삼아 **카카오톡 의존성을 제거**하고, 관리자 업무와 학생 열람 경험을 모두 개선합니다.

→ 자세한 배경, 개선 효과, 보안 설계는 [프로젝트 배경 문서](notes/background.md) 참조

## 기능

**학생**
- PIN 인증 후 시간표 열람
- 회차별 탭 전환 (현재 회차 자동 선택)
- 셀 배경색/폰트색 시트 동일 적용
- 2시간 연속 수업 병합 셀 표시

**관리자** (`/admin`)
- 학생 PIN 변경
- 시간표 캐시 최신화
- 공지 작성/삭제

## 기술 스택

- Next.js 16 / React 19 / TypeScript
- Tailwind CSS 4
- Google Sheets API v4 (서비스 계정)
- Upstash Redis (PIN, 공지 저장)
- Vercel 배포

## 로컬 개발

```bash
npm install
npm run dev
```

`http://localhost:3000`에서 확인.

## 환경변수

`.env.local`에 설정:

```
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GOOGLE_SHEET_ID=시트ID
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=토큰
ADMIN_PASSWORD=관리자비밀번호
```

## 스크립트

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint + TypeScript 타입 체크
npm test         # Vitest 테스트
```

## 학습 노트

프로젝트를 진행하며 정리한 기술 노트들입니다.

### 개념 학습

프레임워크와 웹 기본기를 정리한 문서.

- [RSC 아키텍처](notes/learning/rsc-architecture.md)
- [Next.js 렌더링 방식과 CDN](notes/learning/nextjs-rendering-and-cdn.md)
- [Prerender와 동적 렌더링](notes/learning/prerender-and-dynamic-rendering.md) — 렌더링 시점을 가르는 축
- [쉘과 홀](notes/learning/shell-and-hole.md) — cacheComponents의 Partial Prerender 모델
- [App Router 파일 컨벤션](notes/learning/app-router-conventions.md)
- [revalidate 설정과 미들웨어](notes/learning/revalidate-and-middleware.md)
- [stale-while-revalidate 캐시 사이클](notes/learning/stale-while-revalidate.md) — fresh/stale/expired와 cacheLife 프로파일 선택 기준
- [React Query 캐싱 vs Next.js 캐싱](notes/learning/react-query-vs-nextjs-caching.md) — 저장 위치·공유 범위가 다른 두 모델
- [쿠키 인증](notes/learning/cookies.md)
- [구분 열 검증 — 값 검사와 병합 검사가 독립적인 이유](notes/learning/sheets-separator-validation.md)

### 문제 해결 과정

이 프로젝트에서 부딪힌 문제와 의사결정 기록.

- [캐싱 전략 (On-demand Revalidation)](notes/problem-solving/caching-strategy.md) — 여러 방식 검토 후 선택
- [미들웨어 캐싱 이슈 (AS-IS/TO-BE)](notes/problem-solving/middleware-caching-issue.md) — proxy가 정적 캐싱을 무효화한 문제
- [proxy 캐싱 해결 패턴 A/B/C](notes/problem-solving/proxy-caching-patterns.md) — 세 패턴 비교와 추천
- [`"use cache"` / `cacheTag` / `revalidateTag`](notes/problem-solving/use-cache-and-tags.md) — Next.js 16 Cache Components 모델과 `"max"` 프로파일
- [`new Date()` + cacheComponents 2단계 에러](notes/problem-solving/dynamic-date-with-cache-components.md) — 동적 값을 쉘에 두면 생기는 일과 Suspense 격리
- [매니저 실제 시트 연동 시 발견한 파싱 버그](notes/problem-solving/real-sheet-padding-and-grid-end.md) — 첫 행/열 패딩, 그리드 끝 감지
- [새 시트 연동 시 카테고리 중복 + 시간표 미렌더](notes/problem-solving/multi-block-and-korean-day-labels.md) — 다중 블록과 한글 요일 라벨
- [매니저 색칠 실수 보정 — 색 기반 자동 병합](notes/problem-solving/implicit-merge-from-color.md) — 병합 누락·텍스트 위치·흰색·음영 차이 4가지 패턴 처리
- [서버 날짜 필터링 vs 클라이언트 필터링](notes/problem-solving/server-date-filtering-vs-client-filtering.md) — 미래 회차 필터링 위치와 캐싱 모델 선택
- [M18 카테고리 필터 → 관리자 합계 대시보드](notes/problem-solving/category-filter-vs-target-dashboard.md) — 매니저 요구의 본질을 다시 묻고 설계 방향을 바꾼 기록

### 기술 사용법

외부 서비스 연동 방법.

- [Google Sheets 인증](notes/how-to/google-sheets-auth.md)
- [Redis / Upstash / Supabase 비교](notes/how-to/redis-upstash-supabase.md)
