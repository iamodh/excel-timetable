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

- [RSC 아키텍처](notes/rsc-architecture.md)
- [Next.js 렌더링 방식과 CDN](notes/nextjs-rendering-and-cdn.md)
- [캐싱 전략 (On-demand Revalidation)](notes/caching-strategy.md)
- [revalidate 설정과 미들웨어](notes/revalidate-and-middleware.md)
- [미들웨어 캐싱 이슈 (AS-IS/TO-BE)](notes/middleware-caching-issue.md)
- [쿠키 인증](notes/cookies.md)
- [Google Sheets 인증](notes/google-sheets-auth.md)
- [Redis / Upstash / Supabase 비교](notes/redis-upstash-supabase.md)
