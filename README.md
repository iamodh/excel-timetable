# 김해청년 시간표

Google Sheets 기반 교육 시간표 웹 뷰어. 관리자가 시트에서 시간표를 작성하면 학생들이 웹에서 열람합니다.

## 프로젝트 배경

기존에는 시간표 변경 시 "시트 수정 → 캡처 → 카카오톡 공유"가 필요했고, 학생은 단톡방에서 최신 이미지를 찾아 "이게 최신인가?"를 스스로 판단해야 했습니다. 이 프로젝트는 웹을 단일 진실원으로 삼아 **카카오톡 의존성을 제거**하고, 관리자 업무와 학생 열람 경험을 모두 개선합니다.

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

- [Cache Components 모드와 `"use cache"`](notes/learning/use-cache-in-cache-components.md) — Next.js 16의 dynamic-by-default 모델과 함수 단위 캐시 옵트인
- [Next.js 16 캐시 저장소 — `"use cache"` vs `unstable_cache`](notes/learning/cache-storage-on-vercel.md) — 로컬은 같지만 Vercel에서 갈리는 저장소 백킹
- [쿠키/헤더가 라우트를 동적으로 만드는 매커니즘](notes/learning/dynamic-rendering-and-cookies.md) — Request-time API가 빌드/런타임 분류에 미치는 영향
- [AuthGate를 parent wrapper로 두는 이유](notes/learning/authgate-as-parent-wrapper.md) — Sibling Suspense vs parent wrapper 구조 비교
- [그리드 rowSpan 모델](notes/learning/grid-rowspan-model.md) — 명시 merge와 색 기반 보정이 공유하는 데이터 표현
- [Google Sheets 색상 데이터의 함정](notes/learning/sheet-color-quirks.md) — RGB float 정규화와 흰색/미설정 셀 구분 문제

### 문제 해결 과정

- [미들웨어가 `/` 라우트의 캐싱을 막는 문제](notes/problem-solving/middleware-blocks-root-caching.md) — `proxy.ts`의 쿠키 접근이 정적 캐싱을 무효화한 사례
- [`"use cache"`가 Vercel 인스턴스 간에 공유되지 않는 문제](notes/problem-solving/use-cache-not-shared-on-vercel.md) — process-local LRU의 한계와 `unstable_cache` 전환
- [색 기반 자동 병합 — 매니저 색칠 실수 보정](notes/problem-solving/auto-merge-from-color.md) — 병합 누락·텍스트 위치·흰색·음영 차이 4가지 패턴 처리
