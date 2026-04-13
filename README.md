# 김해청년 시간표

Google Sheets 기반 교육 시간표 웹 뷰어. 관리자가 시트에서 시간표를 작성하면 학생들이 웹에서 열람합니다.

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
- [App Router 파일 컨벤션](notes/learning/app-router-conventions.md)
- [revalidate 설정과 미들웨어](notes/learning/revalidate-and-middleware.md)
- [쿠키 인증](notes/learning/cookies.md)

### 문제 해결 과정

이 프로젝트에서 부딪힌 문제와 의사결정 기록.

- [캐싱 전략 (On-demand Revalidation)](notes/problem-solving/caching-strategy.md) — 여러 방식 검토 후 선택
- [미들웨어 캐싱 이슈 (AS-IS/TO-BE)](notes/problem-solving/middleware-caching-issue.md) — proxy가 정적 캐싱을 무효화한 문제
- [proxy 캐싱 해결 패턴 A/B/C](notes/problem-solving/proxy-caching-patterns.md) — 세 패턴 비교와 추천
- [`"use cache"` / `cacheTag` / `revalidateTag`](notes/problem-solving/use-cache-and-tags.md) — Next.js 16 Cache Components 모델과 `"max"` 프로파일

### 기술 사용법

외부 서비스 연동 방법.

- [Google Sheets 인증](notes/how-to/google-sheets-auth.md)
- [Redis / Upstash / Supabase 비교](notes/how-to/redis-upstash-supabase.md)
