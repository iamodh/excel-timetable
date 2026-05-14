# timetable-web VERSIONS

> 실사용 QA 피드백을 받아 버전 단위로 묶어 배포한다.
> 한 버전은 "한 번에 배포 가능한 개선 묶음"이며, 작업 진행은 `PLAN.md` 마일스톤 포맷을 따른다.
>
> - 항목 완료 시 체크박스 표시 + `→ 커밋해시` 를 덧붙인다
> - 버전이 모두 배포되면 `**완료 조건 충족** ✅` 로 닫고 다음 버전을 추가한다

---

### v1.1 (예정)

**목표:** 1차 실사용 QA 피드백 반영 — 시간표 홈 가시성/사용성 개선 및 다크모드 표시 오류 수정

**배경**
- 실사용 학생/매니저 피드백 누적분을 모아 단일 배포로 처리한다
- 단일 기능 단위로 작게 커밋하되, 배포는 버전 단위로 묶는다

**개선 항목**

- [x] 프로젝트 메타데이터 수정 — `app/layout.tsx`의 `metadata.title`/`description`을 프로젝트명에 맞게 변경, `<html lang>`도 `ko`로 변경 → `a4b4c87`
- [x] favicon 교체 — create-next-app 기본 아이콘에서 프로젝트 아이콘으로 교체 (`app/icon.svg` + `app/apple-icon.png`) → `721ed98`
- [x] 회차 선택 버튼 스크롤 초기 위치 — 가장 오른쪽(최신 회차)에서 시작하도록 초기 스크롤 위치 조정 → `d5f347b`
- [x] 시간표 홈 페이지(`/`) 카테고리 상단 고정 — 스크롤 시에도 카테고리 영역이 화면 최상단에 유지되도록 sticky 처리 → `f6c532d`
- [x] 시간표 테이블 UI 수정 — 시간 열 너비 축소로 본문 셀에 더 많은 가로 공간 확보 → `f6c532d`
- [x] 다크모드 글자 색상 오류 해결 — 다크모드에서 셀/헤더 글자가 배경과 동화되는 케이스 점검 및 수정 → `16c42a4`
- [x] `/` 페이지 Suspense 쉘/홀 분리 — `AuthGate`는 parent wrapper로 유지(redirect 깨짐 방지), 내부에 `<Suspense fallback={<TimetableLoading />}>` 를 `<VisibleSessionTabs />` 만 감싸도록 변경. 공지/가이드 링크는 즉시 노출, 시간표 fetch 중에만 로딩 표시. 참고: `notes/problem-solving/middleware-blocks-root-caching.md` → `cde4c3c`
- [x] Vercel Analytics 통합 — `@vercel/analytics` 패키지 추가 후 `<Analytics />` 컴포넌트를 `app/layout.tsx`에 삽입. 운영 모니터링(방문자/페이지뷰/디바이스 비율) 자동 수집. custom events 미사용. → `a57a60e`

**Manual Tests**

- [ ] 브라우저 탭 제목이 프로젝트명으로 표시됨 (더 이상 "Create Next App" 아님)
- [ ] 브라우저 탭/북마크에 favicon이 표시됨 (데스크탑 + 모바일)
- [ ] 페이지 진입 시 회차 선택 버튼 스크롤이 가장 오른쪽 회차에서 시작됨
- [ ] 모바일/데스크탑 모두에서 시간표 스크롤 시 카테고리 영역이 상단에 고정됨
- [ ] 시간 열 너비 축소 후에도 시간 텍스트가 잘리지 않음
- [ ] OS 다크모드에서 시간표/카테고리/공지 글자가 모두 가독성 있게 표시됨
- [ ] 캐시 미스 시 공지/가이드 링크는 즉시 노출되고, 시간표 영역만 로딩 스피너가 표시됨
- [ ] 배포 후 Vercel Analytics 대시보드에서 페이지뷰가 수집됨 (방문자 0이 아님 확인)

**완료 조건:** 위 개선 항목이 배포 환경에서 정상 동작하고, 기존 기능(회차 전환, PIN, 관리자 페이지)이 회귀 없이 동작함

- Commits:
  - `a4b4c87` chore: 메타데이터를 프로젝트 정보로 변경
  - `721ed98` chore: favicon을 프로젝트 아이콘으로 교체
  - `a847691` chore: favicon.ico 추가 (Safari/구형 브라우저 호환)
  - `a57a60e` feat: Vercel Analytics 통합
  - `d5f347b` feat: 회차 선택 nav 초기 스크롤을 가장 오른쪽으로 이동
  - `f6c532d` feat: 카테고리 범례 sticky 처리 + 시간 열 너비 축소
  - `ae8f87d` feat: 시간 열 너비 80 → 100 미세조정
  - `16c42a4` fix: OS 다크모드에서 글자가 배경과 동화되는 케이스 해결
  - `e8069c6` feat: 공지사항 접기/펼치기 토글 UI
  - `e05588c` revert: 공지사항 토글 UI 롤백 (단일 행 공지로 회귀)
  - `cde4c3c` feat: / 페이지 Suspense 쉘/홀 분리

---
