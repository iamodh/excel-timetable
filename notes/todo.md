# TODO

## 시간표 최신화 후 첫 로딩 병목 확인

관리자 페이지에서 `시간표 최신화` 실행 후 홈으로 돌아갈 때, 빌드 후 첫 접속과 비슷한 서버 대기 시간이 발생할 수 있음. 현재 구현은 Google Sheets API에서 첫 탭의 grid data를 넓게 받아오고 서버에서 전체 row 기반으로 파싱한다.

현재 흐름:

- `lib/sheets.ts`의 `spreadsheets.get({ includeGridData: true })`가 값뿐 아니라 서식/색상/merge 정보를 포함한 큰 응답을 받음
- `ranges` 제한이 없어 첫 탭의 불필요한 빈 행/열까지 응답에 포함될 가능성이 있음
- `extractFirstTabSessions()`가 첫 행/첫 열 padding만 제거한 뒤 `parseSessionBlocks()`로 전달
- `parseSessionBlocks()`는 회차 블록마다 전체 `rowData.map(...slice)`를 수행
- 각 회차는 주차/슬롯 파싱, 색상 변환, 명시/암묵 병합 보정을 거쳐 `SessionTabs` 렌더 데이터가 됨

### 확인할 것

- [ ] `fetchTimetableData()` 내부에서 Google Sheets API 호출 시간 측정
- [ ] `extractFirstTabSessions()` / `parseSessionBlocks()` 파싱 시간 측정
- [ ] `spreadsheets.get` 응답 크기 또는 row/column 수 확인
- [ ] 최신화 직후 첫 `/` 요청에서 API 호출 대기와 파싱 중 무엇이 병목인지 구분

### 최적화 후보

- [ ] `spreadsheets.get`에 필요한 첫 탭 범위만 `ranges`로 지정
- [ ] `fields` 파라미터로 필요한 값만 제한: `formattedValue`, 배경색, 글자색, merges 등
- [ ] 실제 사용 범위 밖 빈 행/열을 덜 받도록 시트 범위 또는 파서 입력 범위 축소
- [ ] 회차 블록별 `rowData.map(...slice)` 반복 비용이 의미 있으면 파서 구조 개선
- [ ] 계측용 로그는 디버깅 후 반드시 제거

---

## 매니저 시트 → Google Sheets 변환

매니저님 시간표 파일이 .xlsx 업로드 형식이라 Sheets API에서 `This operation is not supported for this document` 오류가 발생함. 네이티브 Google Sheets로 변환해야 API 호출 가능.

### 사전 확인 (매니저님께 질문)

- [ ] 시트 파일을 매니저님 외에 직접 열어보시는 분이 있는지
- [ ] Excel 데스크톱 앱으로 직접 편집하시는지, 브라우저에서만 작업하시는지
- [ ] 시트 내 Excel 매크로/Excel 전용 함수 사용 여부 (현재 확인상 없음)

### 변환 절차

1. [ ] 원본 .xlsx를 Drive 내 `_보관` 폴더로 이동
2. [ ] 파일명 변경: `시간표_원본백업_YYYYMMDD.xlsx`
3. [ ] 원본을 Google Sheets로 열고 `파일 → Google Sheets로 저장`
4. [ ] 새 Sheets 파일에 공유 권한 재등록
   - 서비스 계정 `odh9568@excel-timetable.iam.gserviceaccount.com` (뷰어)
   - 매니저님 외 직접 시트 열람자가 있다면 함께 추가
5. [ ] 새 시트 ID 확인 → `.env.local`의 `GOOGLE_SHEET_ID` 교체
6. [ ] Vercel 환경변수도 동일하게 업데이트
7. [ ] 로컬 `npm run dev` + 배포 환경에서 정상 로드 확인

### 안내 (매니저님)

- [ ] 새 Sheets로 작업 방식 동일함을 안내
- [ ] 엑셀 파일 필요 시 `파일 → 다운로드 → Microsoft Excel (.xlsx)`로 즉시 변환 가능
- [ ] 변환 직후 시간표 내용이 평소처럼 보이는지 확인 요청
- [ ] 백업 .xlsx는 한 달 정도 유지 후 정리 예정 안내

### 사후 작업

- [ ] 한 달 운영 후 문제 없으면 백업 .xlsx 정리
- [ ] M17 작업 로그의 "매니저 시트 연결" 관련 Manual Tests 검증

---

## M18 카테고리 필터 — 사전 결정 필요

매니저 요구의 본질은 "카테고리별 목표 시수 vs 실제 배치 시수" 검증. 학생용 강조 UI(M18)만으로는 합계가 안 보여 직관적 검증이 어려움. **웹 관리자 페이지에 회차별 카테고리 합계 표를 추가**하는 방향이 우선 후보 (파서가 이미 색→카테고리 매핑을 갖고 있어 진실원이 갈라지지 않음).

### 매니저님께 질문

- [ ] 카테고리별 **목표 시수 출처**: 시트 헤더(`이수시간` 옆 등)에 카테고리별로 입력 / 관리자 페이지에서 KV 입력 — 어느 쪽이 작업 흐름에 자연스러운지
- [ ] 목표 시수가 **회차마다 다른지, 5회차 누적 합계인지** (UI 형태가 갈림: 회차별 매트릭스 vs 누적 표)
- [ ] **구현 순서**: 학생용 강조(M18)가 먼저 필요한지, 매니저 검증용 합계 표가 먼저 필요한지
- [ ] 시트 함수(Apps Script 사용자 정의 함수)로 시트 안에서 해결하는 옵션 고려 — 매니저가 스크립트 관리 부담을 감수할 의향이 있는지 (우리는 웹 합계 표 권장)
