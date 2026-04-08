# timetable-web TECHSPEC

## 1. 구현

### 1.1 학생 기능

| 기능 | 설명 |
|------|------|
| PIN 인증 | 최초 접속 시 공유 PIN 입력 → 쿠키 저장으로 재입력 불필요 |
| 시간표 열람 | PIN 인증 후 최신 시간표를 그리드 뷰로 확인 |
| 주차별 탐색 | 1~5주차 탭 또는 네비게이션으로 주차 전환 |
| 카테고리 색상 구분 | 시트의 셀 배경색을 그대로 웹에 적용하여 시각적 구분 |
| 셀 병합 표시 | 2시간 이상 연속 수업은 병합된 셀로 표시 |
| 공휴일/휴무 표시 | 어린이날, 근로자의 날 등 특수일 표시 |
| 헤더 정보 표시 | 프로그램명, 기간, 교육장소, 총 이수시간 표시 |
| 카테고리 범례 표시 | 시트 헤더의 카테고리 색상 범례를 웹 상단에 표시 (밀착상담, 사례관리, 외부연계 등) |

### 1.2 관리자 기능

별도 관리자 비밀번호로 관리자 페이지 접근. 관리자 1~2명, 서로 신뢰 관계 전제.

| 기능 | 설명 |
|------|------|
| PIN 변경 | 학생용 공유 PIN을 즉시 변경 (유출 시 또는 주기적) |
| 시간표 최신화 | Google Sheets 변경 후 웹 캐시 갱신 (rate limit: 1분에 1회) |
| 공지 작성 | "PIN 변경됨", "4월 시간표 업데이트" 등 안내 메시지 게시 |

### 1.3 비즈니스 규칙

| 규칙 | 설명 |
|------|------|
| 데이터 소스 | Google Sheets가 유일한 데이터 소스 (Single Source of Truth) |
| PIN 인증 | 학생은 공유 PIN 입력 후 시간표 열람 가능. PIN은 쿠키에 저장 (만료: 30일). Vercel KV에 저장 (관리자 페이지에서 변경 가능, 재배포 시에도 유지) |
| 관리자 인증 | 별도 비밀번호 (`ADMIN_PASSWORD` 환경변수). PIN보다 강한 인증. 쿠키에 저장 (만료: 7일). 비밀번호는 환경변수에 고정 (변경 빈도 낮음, 보안상 KV보다 안전) |
| 캐시 갱신 | On-demand Revalidation — 관리자가 관리자 페이지에서 "최신화" 버튼 클릭 시 캐시 갱신 (rate limit: 1분에 1회) |
| 공지 | 관리자가 작성한 공지를 시간표 상단에 표시. Vercel KV에 저장 |
| 셀 병합 판별 | Google Sheets API의 mergedCells 정보를 사용하여 병합 범위 결정 |
| 카테고리 색상 | 시트 셀 배경색(RGB)을 웹에 그대로 적용 (매핑 테이블 없음) |
| 시트 구조 | 회차별 시트 탭 (시트명: "장기1기 - 2회차" 등). 각 탭은 동일한 구조 (헤더 + 주차별 시간×요일 그리드 반복). v1에서는 고정 구조 가정 |

### 1.4 에러 처리

| 상황 | HTTP 상태코드 | 사용자 메시지 |
|------|--------------|--------------|
| Google Sheets API 호출 실패 | 502 | "시간표를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." |
| 시트 데이터 파싱 실패 | 500 | "시간표 데이터를 처리하는 중 오류가 발생했습니다." |
| 스프레드시트 ID 미설정 | 500 | "시간표 설정이 완료되지 않았습니다." |
| API 할당량 초과 | 429 | "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." |
| 캐시된 데이터 사용 불가 | 503 | "시간표를 불러올 수 없습니다. 잠시 후 다시 시도해주세요." |
| PIN 불일치 | 401 | PIN 입력 페이지 재표시 + "PIN이 올바르지 않습니다." |
| 관리자 비밀번호 불일치 | 401 | "비밀번호가 올바르지 않습니다." |

---

## 2. 목적

### 2.1 이 프로젝트를 통해 이루고자 하는 목적

카카오톡에서 엑셀 스크린샷을 공유하는 기존 방식의 불편함을 해소한다. 관리자가 Google Sheets에서 시간표를 수정하면 웹에 자동 반영되어, 학생은 공유 링크 하나로 항상 최신 시간표를 확인할 수 있다.

### 2.2 2단계 구현 항목

- 시간표 변경 알림 (카카오톡 / 웹 푸시)
- 여러 기수/프로그램 지원 (멀티 시트)

---

## 3. 작업 목록

| # | 작업 | 설명 |
|---|------|------|
| 1 | 프로젝트 초기화 | Next.js + TypeScript + Tailwind CSS 셋업 |
| 2 | Google Sheets API 연동 | 서비스 계정 설정, API 클라이언트 구현 |
| 3 | 시트 데이터 파싱 | 셀 값, 배경색, 병합 정보를 내부 데이터 모델로 변환 |
| 4 | 셀 배경색 적용 | 시트 배경색 RGB → 웹 셀 배경색으로 직접 적용 |
| 5 | 시간표 그리드 컴포넌트 | 주차별 × 요일 × 시간대 테이블 렌더링 (셀 병합 포함) |
| 6 | 헤더 영역 컴포넌트 | 프로그램명, 기간, 장소, 이수시간 표시 |
| 7 | 주차 네비게이션 | 1~5주차 탭 전환 UI |
| 8 | 공휴일/휴무 표시 | 특수일 셀 스타일링 |
| 9 | 모바일 반응형 | 시트와 동일한 테이블 레이아웃 + 가로 스크롤 (배포 후 뷰 확인하여 조정) |
| 10 | PIN 접근 제어 | PIN 입력 페이지 + 미들웨어 검증 + 쿠키 저장 + Vercel KV 연동 |
| 11 | 관리자 기능 | 관리자 인증 (환경변수) + PIN 변경 (KV) + 시간표 최신화 (rate limit) + 공지 작성 (KV) |
| 12 | Vercel 배포 | 환경변수 설정 (ADMIN_PASSWORD, KV 연결), 배포 파이프라인 구성 |

---

## 4. 아키텍처

### 4.1 개발 환경

| 항목 | 선택 |
|------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Data Source | Google Sheets API v4 (read-only) |
| Auth | 서비스 계정 (Service Account) — 서버 사이드 전용 |
| KV Store | Vercel KV — PIN, 공지 저장 (무료 티어) |
| Deployment | Vercel |
| Package Manager | npm |
| Node.js | 20+ |

### 4.2 애플리케이션 아키텍처

```
┌─────────────────────────────────────────────┐
│                   Vercel                     │
│  ┌───────────────────────────────────────┐   │
│  │         Next.js App Router            │   │
│  │                                       │   │
│  │  ┌─────────┐    ┌─────────────────┐   │   │
│  │  │  Page   │───▶│  Server Action/  │   │   │
│  │  │ (RSC)   │    │  Data Fetcher    │   │   │
│  │  └─────────┘    └────────┬────────┘   │   │
│  │                          │            │   │
│  │                 ┌────────▼────────┐   │   │
│  │                 │  Sheet Parser   │   │   │
│  │                 │  (색상매핑/병합) │   │   │
│  │                 └────────┬────────┘   │   │
│  └──────────────────────────┼────────────┘   │
│                             │                │
└─────────────────────────────┼────────────────┘
                              │ On-demand Revalidation
                    ┌─────────▼─────────┐
                    │  Google Sheets    │
                    │  API v4           │
                    └───────────────────┘
```

### 4.3 배포 아키텍처

```
[학생 모바일 브라우저]          [관리자 브라우저]
        │                           │
        │ HTTPS (공유 링크)          │ /admin (비밀번호 인증)
        ▼                           ▼
   [Vercel CDN/Edge] ◄── PIN 미들웨어 검증
        │
        │ 캐시 히트 → 즉시 응답
        │ 관리자 최신화 시 → 서버 재렌더링
        ▼
   [Next.js Server]
        │
        │ 서비스 계정 인증
        ▼
   [Google Sheets API]
```

---

## 5. 라우트 설계

| 경로 | 타입 | 설명 |
|------|------|------|
| `/` | Page (RSC) | 시간표 메인 페이지. PIN 인증 후 접근 가능 |
| `/pin` | Page | PIN 입력 페이지 |
| `/admin` | Page | 관리자 페이지 (비밀번호 인증 후 접근) |
| `POST /api/auth/pin` | Route Handler | PIN 검증 → 쿠키 설정 |
| `POST /api/auth/admin` | Route Handler | 관리자 비밀번호 검증 → 쿠키 설정 |
| `POST /api/revalidate` | Route Handler | 시간표 최신화 (rate limit: 60초, 관리자 전용) |
| `POST /api/pin` | Route Handler | PIN 변경 (관리자 전용) |
| `POST /api/notice` | Route Handler | 공지 작성/삭제 (관리자 전용) |

주차 전환은 클라이언트에서 탭 전환 (페이지 새로고침 없음). PIN 미인증 시 `/pin`으로 리다이렉트.

---

## 6. 데이터 모델

DB 없음. Google Sheets → 파싱 → 내부 TypeScript 타입으로 변환.

### 6.0 시트 행 구조

각 시트 탭은 동일한 레이아웃. 행 번호는 0-indexed.

```
행0~1   카테고리 범례 (셀마다 카테고리명 + 배경색)
행2     시간표 정보: A-B "프로그램명", C-D "기간", E-F "교육장소 : 장소명"
행3     이수시간: A-F "40h"
행4~    그리드 영역 — 9행 단위 반복:
         1행: 요일 헤더 ([N주차] [화] [수] [목] [금] [월])
         8행: 시간대 슬롯 (09:00~16:00)
```

파싱 시 슬라이스하여 각 함수에 전달:
- `rowData.slice(0, 2)` → 범례 파싱
- `rowData.slice(2, 4)` → 헤더 파싱
- `rowData.slice(4)` → 그리드 파싱 (9행 단위로 주차 분리)

### 6.1 내부 데이터 모델

**TimetableData**

| 필드 | 타입 | 설명 |
|------|------|------|
| programName | string | 프로그램명 (예: "장기1기 - 2회차") |
| period | string | 교육 기간 (예: "2026.04.07~2026.05.11") |
| location | string | 교육장소 (예: "청년어울림센터(장유)") |
| totalHours | string | 총 이수시간 (예: "40h") |
| categories | Category[] | 카테고리 색상 범례 (시트 헤더 영역에서 파싱) |
| weeks | Week[] | 주차별 시간표 배열 |

**Week**

| 필드 | 타입 | 설명 |
|------|------|------|
| weekNumber | number | 주차 번호 (1~5) |
| days | Day[] | 요일별 데이터 (화, 수, 목, 금, 월 순서) |

**Day**

| 필드 | 타입 | 설명 |
|------|------|------|
| dayOfWeek | string | 요일명 |
| date | string | 날짜 (예: "4/8") |
| isHoliday | boolean | 공휴일/휴무 여부 |
| holidayName | string \| null | 공휴일명 (예: "어린이날") |
| slots | Slot[] | 시간대별 수업 슬롯 |

**Slot**

| 필드 | 타입 | 설명 |
|------|------|------|
| startTime | string | 시작 시간 (예: "09:00") |
| endTime | string | 종료 시간 (예: "10:00") |
| title | string | 수업명 (예: "기초상담 (1)") |
| subtitle | string \| null | 부가정보 (예: "미네르바에듀") |
| bgColor | string | 셀 배경색 (예: "#A8D5A2"), 시트에서 그대로 가져옴 |
| rowSpan | number | 병합 행 수 (기본 1, 2시간 수업이면 2) |
| isMergedContinuation | boolean | 병합된 셀의 연속 부분인지 여부 |

**Category**

| 필드 | 타입 | 설명 |
|------|------|------|
| name | string | 카테고리명 (예: "밀착상담", "사례관리", "외부연계") |
| color | string | 배경색 hex (예: "#F4A460") |

카테고리 enum 없음. 시트 헤더의 범례 행에서 카테고리명과 배경색을 파싱한다 (하드코딩 아님).
각 슬롯의 bgColor는 항상 해당 셀의 배경색에서 직접 추출한다. 카테고리 범례와 색상이 일치하면 카테고리를 알 수 있고, 일치하는 카테고리가 없는 셀도 배경색은 그대로 표시된다.
시트에서 색상을 변경하면 웹에도 자동 반영된다.

---

## 7. 핵심 구현 로직

### 7.1 Google Sheets 데이터 페칭

스프레드시트는 **회차별 시트 탭** 구조. 각 탭은 동일한 레이아웃(범례 + 헤더 + 주차별 시간×요일 그리드 반복)을 가진다.
`includeGridData: true`로 한 번의 API 호출로 모든 탭의 셀 데이터·배경색·병합 정보를 가져온다.

```typescript
// lib/sheets.ts
async function fetchTimetableData(): Promise<TimetableData> {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const sheets = google.sheets({ version: 'v4', auth })

  // includeGridData: true로 모든 시트 탭의 셀 배경색·병합 정보 포함
  const response = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    includeGridData: true,
  })

  // response.data.sheets = [
  //   { properties: { title: "장기1기 - 2회차" }, data: [...], merges: [...] },
  //   ...
  // ]
  // 각 시트 탭(회차)을 순회하며 동일한 파싱 로직 적용
  // 탭 내부에서 주차는 9행 단위 반복으로 분리
  const sheetTabs = response.data.sheets ?? []
  const firstTab = sheetTabs[0]
  const header = parseHeader(firstTab)
  const weeks = parseWeeks(firstTab) // 단일 탭 내 9행 단위로 주차 분리

  return { ...header, weeks }
}
```

### 7.2 셀 배경색 변환

```typescript
// lib/color.ts
// Google Sheets API는 RGB를 0~1 소수로 반환 → hex 문자열로 변환
function toHexColor(bgColor?: { red?: number; green?: number; blue?: number }): string {
  if (!bgColor) return "#ffffff"
  const r = Math.round((bgColor.red ?? 1) * 255)
  const g = Math.round((bgColor.green ?? 1) * 255)
  const b = Math.round((bgColor.blue ?? 1) * 255)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}
```

### 7.3 셀 병합 처리

각 시트 탭 내에서 병합 정보를 처리한다. 모든 탭이 동일한 구조이므로 같은 함수를 재사용.

```typescript
// lib/parser.ts
function processMergedCells(
  gridData: GridData,
  merges: GridRange[]
): Slot[][] {
  // 1. 전체 셀을 기본 슬롯으로 변환
  // 2. merges 배열 순회하며 병합 범위 확인
  // 3. 병합 시작 셀: rowSpan = endRowIndex - startRowIndex
  // 4. 병합 연속 셀: isMergedContinuation = true
  for (const merge of merges) {
    const span = merge.endRowIndex - merge.startRowIndex
    if (span > 1) {
      slots[merge.startRowIndex][merge.startColumnIndex].rowSpan = span
      for (let r = merge.startRowIndex + 1; r < merge.endRowIndex; r++) {
        slots[r][merge.startColumnIndex].isMergedContinuation = true
      }
    }
  }
  return slots
}
```

### 7.4 주차 전환 (클라이언트)

```typescript
// components/WeekTabs.tsx (Client Component)
"use client";

export function WeekTabs({ weeks }: { weeks: Week[] }) {
  const [currentWeek, setCurrentWeek] = useState(() => determineCurrentWeek(weeks));

  return (
    <>
      <nav>
        {weeks.map((w) => (
          <button key={w.weekNumber} onClick={() => setCurrentWeek(w.weekNumber)}>
            {w.weekNumber}주차
          </button>
        ))}
      </nav>
      <TimetableGrid week={weeks[currentWeek - 1]} />
    </>
  );
}
```

### 7.5 PIN 접근 제어

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/pin", "/api/auth/pin"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const pin = request.cookies.get("student_pin")?.value
  const storedPin = await kv.get("student_pin") // Vercel KV에서 조회
  if (pin !== storedPin) {
    return NextResponse.redirect(new URL("/pin", request.url))
  }

  return NextResponse.next()
}
```

### 7.6 관리자 인증 + 기능

```typescript
// app/api/auth/admin/route.ts
export async function POST(request: Request) {
  const { password } = await request.json()
  if (password !== process.env.ADMIN_PASSWORD) {
    return Response.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 })
  }
  // 쿠키에 관리자 토큰 설정 (만료: 7일)
  // ...
}
```

관리자 페이지(`/admin`)에서 제공하는 기능:
- **PIN 변경**: `POST /api/pin` — 새 PIN 설정 → Vercel KV에 저장 (재배포 시에도 유지)
- **시간표 최신화**: `POST /api/revalidate` — rate limit 60초, `revalidatePath("/")` 호출
- **공지 작성**: `POST /api/notice` — Vercel KV에 저장, 시간표 상단에 표시

### 7.7 On-demand Revalidation (관리자 전용)

```typescript
// app/api/revalidate/route.ts
import { revalidatePath } from "next/cache"

const RATE_LIMIT_SECONDS = 60
let lastRevalidated = 0

export async function POST(request: Request) {
  // 관리자 쿠키 검증
  // ...

  const now = Date.now()
  if (now - lastRevalidated < RATE_LIMIT_SECONDS * 1000) {
    return Response.json(
      { message: "잠시 후 다시 시도해주세요." },
      { status: 429 }
    )
  }

  lastRevalidated = now
  revalidatePath("/")
  return Response.json({ message: "시간표가 최신화되었습니다." })
}
```

```typescript
// app/page.tsx
export const revalidate = false // 자동 갱신 없음, 관리자 최신화로만 갱신

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: { week?: string }
}) {
  const data = await fetchTimetableData()
  const currentWeek = determineCurrentWeek(data, searchParams.week)

  return <TimetableGrid data={data} week={currentWeek} />
}
```

### 7.8 현재 주차 자동 판별

```typescript
// lib/utils.ts
function determineCurrentWeek(weeks: Week[]): number {
  const today = new Date()
  for (const week of weeks) {
    for (const day of week.days) {
      if (isSameDate(today, parseDate(day.date))) {
        return week.weekNumber
      }
    }
  }
  return 1
}
```

---

## 8. 테스트 전략

### 8.1 필수 검증 항목 (P0)

| # | 항목 | 검증 방법 |
|---|------|----------|
| 1 | Google Sheets API 데이터 페칭 정상 동작 | 실제 시트 연동 수동 테스트 |
| 2 | 시트 파싱 결과 정확성 (셀 값, 배경색, 병합) | 유닛 테스트 — 목 데이터 기반 |
| 3 | 셀 배경색 적용 정확성 | 유닛 테스트 — RGB(0~1) → hex 변환 |
| 4 | 셀 병합 렌더링 (rowSpan 적용) | 수동 테스트 — 2시간 연속 수업 확인 |
| 5 | 모바일 레이아웃 정상 표시 | 수동 테스트 — 모바일 디바이스/에뮬레이터 |
| 6 | 주차 전환 동작 | 수동 테스트 — 탭 클릭 시 올바른 주차 표시 |

### 8.2 추가 검증 항목 (P1)

| # | 항목 | 검증 방법 |
|---|------|----------|
| 1 | 최신화 버튼 동작 확인 | 시트 수정 → 관리자 페이지에서 최신화 → 페이지 갱신 확인 |
| 2 | 공휴일/휴무 표시 | 수동 테스트 — 해당 일자 셀 스타일 확인 |
| 3 | API 에러 시 폴백 UI | 네트워크 차단 후 에러 메시지 표시 확인 |
| 4 | 현재 주차 자동 판별 | 수동 테스트 — 날짜 변경하며 확인 |
| 5 | PIN 미입력 시 /pin 리다이렉트 | 쿠키 없이 / 접속 → /pin으로 이동 확인 |
| 6 | 잘못된 PIN 입력 시 에러 표시 | 틀린 PIN 입력 → 에러 메시지 확인 |
| 7 | 관리자 PIN 변경 후 즉시 적용 | 관리자 페이지에서 PIN 변경 → 기존 PIN으로 접근 실패 확인 |
| 8 | 공지 작성/표시 | 관리자 페이지에서 공지 작성 → 시간표 상단에 표시 확인 |

### 8.3 테스트 도구

| 도구 | 용도 |
|------|------|
| Vitest | 유닛 테스트 (파싱 로직, 색상 매핑) |
| Chrome DevTools | 모바일 반응형 확인 |
| 실기기 (모바일) | 카카오톡 인앱 브라우저 동작 확인 |
