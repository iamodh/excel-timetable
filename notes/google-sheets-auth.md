# Google Sheets API 인증 구조

## 전체 흐름

```
학생이 웹 접속
    → Next.js 서버가 시트 데이터 필요
    → JSON 키로 서비스 계정 인증
    → Google Sheets API 호출
    → 시트 데이터 받아서 렌더링
```

## 개념 정리

### Google Cloud 프로젝트

- Google API를 쓰기 위한 "작업 공간"
- excel-timetable 앱이 Google API를 사용할 수 있도록 등록하는 곳
- 여기서 어떤 API를 쓸지 (Sheets API), 누가 쓸지 (서비스 계정)를 설정

### Google Sheets API

- 시트 데이터를 코드로 읽는 기능
- Google Cloud 프로젝트에서 "사용 설정"해야 호출 가능

### 서비스 계정 (Service Account)

- 사람이 아닌 **앱 전용 Google 계정**
- 로그인 팝업 없이 서버에서 자동으로 인증 가능
- 이메일 형태: `xxx@your-project.iam.gserviceaccount.com`
- 시트를 읽으려면 이 이메일에 시트 "뷰어" 공유 필요

### IAM (Identity and Access Management)

- "누가 뭘 할 수 있는지" 관리하는 곳
- 서비스 계정 생성/관리를 여기서 함

### JSON 키 파일

- 서비스 계정의 **비밀번호** 같은 것
- 이 파일 내용을 `.env.local`의 `GOOGLE_SERVICE_ACCOUNT_KEY`에 넣음
- 주요 필드: `client_email` (서비스 계정 이메일), `private_key` (인증 키)
- **절대 git에 커밋하지 않는다** (.gitignore에 포함됨)

## 환경변수 (.env.local)

```
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","client_email":"...","private_key":"..."}
GOOGLE_SHEET_ID=시트URL의_/d/_뒤_ID값
```

- Next.js 서버가 실행 시 이 값을 읽어서 Google API에 인증
- Vercel 배포 시에도 환경변수로 등록

## 시트 공유가 필요한 이유

서비스 계정은 별도의 Google 계정이라 본인 시트에 접근 권한이 없음.
시트 공유 설정에서 서비스 계정 이메일을 "뷰어"로 추가해야 읽을 수 있음.
