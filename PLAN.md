# timetable-web PLAN

---

### Milestone 1: 프로젝트 초기화

**목표:** Next.js + TypeScript + Tailwind CSS 프로젝트 셋업

> 📖 TECHSPEC 섹션 4.1 참조

**완료 조건:** `npm run dev`로 로컬 서버 실행 시 기본 페이지 표시 ✅

- Commits: d05a37b, 9eeb709

---

### Milestone 2: Google Sheets 준비

**목표:** 시간표 시트 생성 + 서비스 계정 설정

**작업 (수동)**

- [x] Google Cloud Console에서 프로젝트 생성
- [x] Google Sheets API 활성화
- [x] 서비스 계정 생성 + JSON 키 다운로드
- [x] 시간표 Google Sheets 생성 (실제 시간표 구조로 샘플 데이터 입력)
- [x] 시트를 서비스 계정 이메일에 "뷰어" 권한으로 공유
- [x] `.env.local`에 `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SHEET_ID` 설정

**완료 조건:** 서비스 계정으로 시트 데이터 접근 가능 확인 (API Explorer 또는 curl) ✅

- Commits: 수동 작업 (코드 커밋 없음)

---

### Milestone 3: Google Sheets API 연동

**목표:** 서비스 계정으로 Google Sheets API 데이터 페칭

> 📖 TECHSPEC 섹션 7.1 참조

**Unit Tests**

- [x] 환경변수 미설정 시 명확한 에러 발생
- [x] API 응답을 받아 raw 데이터 반환 확인

**완료 조건:** `fetchTimetableData()` 호출 시 실제 시트 데이터(raw)가 콘솔에 출력됨 ✅

- Commits: eadc918, 8b69f8f

---

### Milestone 4: 시트 데이터 파싱

**목표:** 셀 값, 배경색, 병합 정보를 내부 데이터 모델(TimetableData)로 변환

> 📖 TECHSPEC 섹션 6.1, 7.2, 7.3 참조

**완료 조건:** 파싱 결과가 TimetableData 타입과 일치하고, 셀 값·배경색·병합 정보가 정확함 ✅

- Commits: 89c036d, 7ce3def

---

### Milestone 4-T: 파싱 P0 테스트

**목표:** 파싱 로직과 색상 변환의 정확성 검증

> 📖 TECHSPEC 섹션 8.1 #2, #3 참조

**Unit Tests (P0)**

- [x] RGB(0~1) → hex 변환 정확성 (예: `{red: 0.66, green: 0.84, blue: 0.63}` → `#a8d6a1`)
- [x] 배경색 없는 셀 → `#ffffff` 반환
- [x] 병합 셀 처리: rowSpan 값 정확성 (2시간 수업 → rowSpan: 2)
- [x] 병합 연속 셀: isMergedContinuation = true
- [x] 헤더 영역 파싱: programName, period, location, totalHours 추출
- [x] 빈 셀 처리

**완료 조건:** `npm test` 전체 통과 ✅

- Commits: d808784, 02221e8

---

### Milestone 5: 시간표 그리드 렌더링

**목표:** 헤더 정보 + 요일 × 시간대 테이블 + 셀 병합 + 배경색 적용

> 📖 TECHSPEC 섹션 1.1, 7.2, 7.3 참조

**Manual Tests**

- [x] 헤더에 프로그램명, 기간, 장소, 이수시간 표시
- [x] 요일(화~월) × 시간대(09:00~17:00) 그리드 렌더링
- [x] 각 셀에 수업명 + 부가정보 표시
- [x] 셀 배경색이 시트와 동일하게 적용
- [x] 2시간 연속 수업이 병합된 셀로 표시 (rowSpan)

**완료 조건:** 브라우저에서 `/` 접속 시 시트와 동일한 형태의 시간표 그리드 표시 ✅

- Commits: 2d07209, e4c5268

---

### Milestone 6: 첫 배포

**목표:** Vercel 배포 + 환경변수 설정

> 📖 TECHSPEC 섹션 4.3 참조

**Manual Tests**

- [x] 배포된 URL에서 시간표 정상 표시
- [x] Google Sheets API 연동 정상 동작 (서비스 계정 환경변수)

**완료 조건:** 공유 가능한 URL에서 시간표 열람 가능 ✅

- Commits: M5 이후 수동 배포 완료

---

### Milestone 7: 회차 탭 전환

**목표:** 회차(시트 탭) 간 클라이언트 탭 전환 + 현재 회차 자동 선택

> 📖 TECHSPEC 섹션 7.4, 7.8 참조

**Manual Tests**

- [ ] 탭 클릭 시 페이지 새로고침 없이 회차 전환
- [ ] 각 회차 내 주차는 한 페이지에 모두 렌더링
- [ ] 오늘 날짜에 해당하는 회차가 기본 선택됨
- [ ] 교육 기간 외 접속 시 첫 번째 회차 표시

**완료 조건:** 회차 탭 클릭으로 즉시 전환되고, 초기 로드 시 현재 회차 자동 선택

- Commits: ba6afc7, a40702f

---

### Milestone 8: 공휴일/휴무 표시

**목표:** 어린이날, 근로자의 날 등 특수일 셀 스타일링

> 📖 TECHSPEC 섹션 1.1 참조

**Manual Tests**

- [ ] 공휴일 셀에 휴일명 표시
- [ ] 공휴일 셀이 시각적으로 구분됨 (배경색 또는 텍스트 스타일)

**완료 조건:** 공휴일 해당 날짜에 휴일명과 구분 스타일 표시

- Commits:

---

### Milestone 9: 최신화 기능

**목표:** /api/revalidate 엔드포인트 + 최신화 버튼 + rate limit

> 📖 TECHSPEC 섹션 7.7 참조

**Unit Tests**

- [ ] rate limit 60초 이내 재요청 시 429 응답
- [ ] rate limit 경과 후 요청 시 200 응답

**Manual Tests**

- [ ] 시트 수정 → 최신화 버튼 클릭 → 페이지에 변경 반영
- [ ] 버튼 연속 클릭 시 "잠시 후 다시 시도해주세요." 메시지 표시

**완료 조건:** 최신화 버튼 클릭으로 시트 변경사항이 웹에 반영되고, rate limit 동작 확인

- Commits:

---

### Milestone 10: 모바일 반응형

**목표:** 모바일 뷰포트에서 시트와 동일한 테이블 레이아웃 + 가로 스크롤

> 📖 TECHSPEC 섹션 1.1 참조

**Manual Tests**

- [ ] 모바일 뷰포트(375px)에서 테이블이 가로 스크롤로 표시
- [ ] 카카오톡 인앱 브라우저에서 정상 렌더링
- [ ] 주차 탭, 최신화 버튼 터치 동작 정상

**완료 조건:** 모바일 브라우저에서 가로 스크롤로 전체 시간표 확인 가능

- Commits:

---

### Milestone 11: PIN 접근 제어

**목표:** 공유 PIN으로 시간표 접근 제한 — Vercel KV에 PIN 저장, 미인증 시 PIN 입력 페이지로 리다이렉트

> 📖 TECHSPEC 섹션 7.5 참조

**Unit Tests**

- [ ] PIN 일치 시 쿠키 설정 + 200 응답
- [ ] PIN 불일치 시 401 응답

**Manual Tests**

- [ ] 쿠키 없이 `/` 접속 → `/pin`으로 리다이렉트
- [ ] 올바른 PIN 입력 → 시간표 페이지로 이동
- [ ] 잘못된 PIN 입력 → 에러 메시지 표시
- [ ] PIN 인증 후 재접속 시 PIN 재입력 불필요 (쿠키)

**완료 조건:** PIN 미인증 사용자는 시간표 접근 불가, 인증 후 쿠키로 자동 인증

- Commits:

---

### Milestone 12: 관리자 인증 + 기능

**목표:** 관리자 비밀번호 인증 (환경변수) + PIN 변경 (KV) + 시간표 최신화를 관리자 전용으로 변경 + 공지 작성 (KV)

> 📖 TECHSPEC 섹션 7.6, 7.7 참조

**Unit Tests**

- [ ] 관리자 비밀번호 일치 시 쿠키 설정 + 200 응답
- [ ] 관리자 비밀번호 불일치 시 401 응답

**Manual Tests**

- [ ] 관리자 로그인 → 관리자 페이지 접근
- [ ] PIN 변경 → 기존 PIN으로 접근 실패 확인
- [ ] 최신화 버튼이 관리자 전용으로 이동됨
- [ ] 공지 작성 → 시간표 상단에 공지 표시
- [ ] 공지 삭제 → 공지 사라짐 확인

**완료 조건:** 관리자 페이지에서 PIN 변경, 시간표 최신화, 공지 CRUD 모두 동작

- Commits:

---

### Milestone 13: 최종 QA

**목표:** 에러 처리 UI 적용 + 전체 테스트 검증

> 📖 TECHSPEC 섹션 1.4, 8.1, 8.2 참조

**Manual Tests**

- [ ] PIN 보호 동작 확인 (배포 환경)
- [ ] 관리자 기능 동작 확인 (배포 환경)
- [ ] API 에러 시 에러 메시지 표시: "시간표를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
- [ ] 전체 P1 항목 검증 (§8.2)

**완료 조건:** 전체 기능 최종 확인, 배포 환경에서 정상 동작

- Commits:

---

## 🧪 P0 테스트 체크리스트

| 마일스톤 | 테스트 | 상태 |
|---------|--------|------|
| M4-T | RGB(0~1) → hex 변환 정확성 | [x] |
| M4-T | 배경색 없는 셀 → #ffffff | [x] |
| M4-T | 병합 셀 rowSpan 값 정확성 | [x] |
| M4-T | 병합 연속 셀 isMergedContinuation | [x] |
| M4-T | 헤더 영역 파싱 정확성 | [x] |
| M4-T | 빈 셀 처리 | [x] |
| M9 | rate limit 60초 이내 429 응답 | [ ] |
| M9 | rate limit 경과 후 200 응답 | [ ] |
| M11 | PIN 일치 시 쿠키 설정 + 200 응답 | [ ] |
| M11 | PIN 불일치 시 401 응답 | [ ] |
| M12 | 관리자 비밀번호 일치 시 200 응답 | [ ] |
| M12 | 관리자 비밀번호 불일치 시 401 응답 | [ ] |
