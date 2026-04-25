# TODO

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
