# React Server Components (RSC) 아키텍처 정리

Next.js 16 App Router의 서버/클라이언트 컴포넌트 모델을 이 프로젝트 관점에서 정리한 문서.

---

## 1. 기본 원칙

Next.js App Router에서 **모든 컴포넌트는 기본값이 서버 컴포넌트**다. 클라이언트 컴포넌트가 되려면 파일 최상단에 `"use client"` 지시어를 붙여야 한다. "opt-in to client" 모델.

---

## 2. 서버 컴포넌트 vs 클라이언트 컴포넌트

| 항목 | 서버 컴포넌트 (RSC) | 클라이언트 컴포넌트 |
|------|---------------------|----------------------|
| 실행 위치 | 서버에서 한 번 렌더링 | 서버 초기 렌더 + 브라우저 hydration |
| JS 번들 포함 | ❌ 클라이언트로 전송 안 됨 | ✅ 번들에 포함 |
| `useState`, `useEffect` | ❌ 사용 불가 | ✅ 가능 |
| 이벤트 핸들러 | ❌ 불가 | ✅ 가능 |
| Browser API (`window` 등) | ❌ 불가 | ✅ 가능 |
| 서버 리소스 (DB, 환경변수) | ✅ 직접 접근 | ❌ 불가 |
| `async` 컴포넌트 | ✅ 가능 | ❌ (Suspense 필요) |
| 의존성 번들 비용 | 0 KB | 라이브러리 크기만큼 증가 |

### 서버 컴포넌트의 정확한 정의

"데이터 페칭을 하는 컴포넌트"가 아니라 **"클라이언트 번들에 코드가 들어가지 않는 컴포넌트"**. 데이터 페칭은 서버 컴포넌트가 할 수 있는 일 중 하나일 뿐.

---

## 3. 서버 컴포넌트를 기본값으로 쓰는 이유

1. **번들 크기 제로** — 상호작용 없는 UI는 브라우저로 JS를 보낼 이유가 없다. 모바일 성능에 직결. (이 프로젝트는 카카오톡 인앱 브라우저 타겟이라 특히 중요)
2. **데이터 소스 근접성** — `await`로 DB/API를 직접 호출. "API 엔드포인트 만들고 → fetch → 로딩 상태 → 에러 처리" 4단계가 `await` 한 줄로.
3. **비밀값 보호** — `GOOGLE_SERVICE_ACCOUNT_KEY` 같은 크레덴셜을 서버 컴포넌트에서 직접 사용해도 번들에 새지 않는다.
4. **무거운 의존성을 서버에 가두기** — `googleapis` 같은 수 MB 패키지가 클라이언트 번들에 포함되지 않는다.
5. **Islands Architecture** — 상호작용이 필요한 작은 섬만 클라이언트가 된다.

---

## 4. 사용법

### 기본 (서버)

```tsx
// app/page.tsx
export default function Page() {
  return <h1>안녕</h1>
}
```

### async 데이터 페칭

```tsx
// app/page.tsx
import { fetchTimetableData } from "@/lib/sheets"

export default async function Page() {
  const data = await fetchTimetableData()  // 서버에서만 가능
  return <TimetableGrid data={data} />
}
```

### 클라이언트 컴포넌트

```tsx
// components/WeekTabs.tsx
"use client"
import { useState } from "react"

export function WeekTabs({ weeks }: { weeks: Week[] }) {
  const [current, setCurrent] = useState(1)
  return weeks.map(w => <button onClick={() => setCurrent(w.n)}>...</button>)
}
```

### 경계 긋기 원칙

- `"use client"`는 트리의 **말단**에 둔다 (부모가 클라이언트가 되면 자식도 자동 클라이언트)
- 단, 클라이언트 컴포넌트의 `children` prop으로 서버 컴포넌트를 주입하면 그 자식은 서버로 유지됨 — Islands 테크닉의 핵심
- 서버 → 클라이언트로 넘기는 props는 **직렬화 가능한 값**만 (함수, 클래스 인스턴스, Map/Set 불가)

### 판단 기준

```
상태/효과 필요?                → "use client"
이벤트 핸들러 있음?             → "use client"
Browser API?                    → "use client"
서드파티 클라이언트 훅?          → "use client"
위의 어느 것도 아님             → 기본값 (서버)
```

---

## 5. MVC와의 비교: 데이터 흐름

### 전통 웹 MVC (Rails, Spring)

```
[브라우저] ──GET──▶ Controller ──▶ Model ──▶ View(템플릿) ──HTML──▶ [브라우저]
```

- 단방향, 한 번의 왕복
- 상호작용은 폼 submit → 새 요청 → 전체 페이지 재렌더

### SPA + REST API

```
[브라우저: V(React)]  ──fetch──▶  [서버: C(API) + M(DB)]
       │                                    │
       └──useState/useEffect로 상태 관리     JSON 응답
```

- V가 클라이언트로 이사, C가 V와 M 사이의 HTTP 경계가 됨
- 문제: API 스펙 중복 정의, 로딩 상태 3-state(`loading/error/data`), waterfall, 비밀값 다룰 수 없음

### RSC

```
[서버]
  Server Component (async) ──await──▶ lib/sheets (Model)
        │
        ▼
  JSX 트리 생성
        │
        ├─ HTML 직렬화 ──────┐
        └─ RSC payload ──────┼──▶ [브라우저]
                             │      │
                             │      ├─ HTML로 첫 화면 즉시 표시
                             │      ├─ JS 번들 다운로드
                             │      └─ 클라이언트 컴포넌트만 hydration
```

- **C(API 레이어)가 사라진다.** 서버 V가 M을 직접 `await`로 호출.
- 단, 뮤테이션(최신화 버튼)은 여전히 `POST /api/revalidate`로 처리 — C의 반쪽만 남는 셈.
- 읽기 경로에서는 타입이 서버→클라이언트까지 한 번도 JSON으로 변환되지 않고 관통한다.

---

## 6. 용어 정리

### HTML (첫 화면)

서버 컴포넌트 렌더링 결과를 문자열 HTML로 변환해서 전송. JS 로드 전에도 브라우저가 화면을 그릴 수 있다.

**왜 중요한가**
- FCP(First Contentful Paint) 빠름
- 크롤러 / 카카오톡 링크 미리보기가 내용 읽을 수 있음 (SEO, OG)
- 느린 네트워크에서 체감 성능 큼

### RSC Payload

JSX 트리를 서버가 직렬화한 특수 포맷. HTML과 **별도로** 전송된다. 대략 이런 형태:

```
0:["$","div",null,{"children":[
  ["$","Header",null,{"info":{"programName":"장기1기"}}],
  ["$","$L1",null,{"weeks":[...]}]       ← $L1 = 클라이언트 컴포넌트 참조
]}]
1:I["./WeekTabs.js","WeekTabs"]
```

**역할**
1. React에 "이 DOM 어디에 어떤 클라이언트 컴포넌트가 있는지" 알림
2. 서버 컴포넌트가 생성한 props를 클라이언트 컴포넌트로 전달하는 통로
3. 재렌더링 시(`revalidatePath`, `router.refresh`) 전체 페이지 새로고침 없이 부분 패치

### Hydration

정적 HTML DOM을 인터랙티브 React 컴포넌트로 **"되살리는"** 과정. 건조된 미역에 물을 부어 원래 모습으로 되돌리는 것에 비유된다.

**절차**
1. React가 클라이언트 컴포넌트의 JS 번들 실행
2. 기존 DOM 노드를 새로 만들지 않고 재사용
3. `useState` 초기값 설정, `onClick` 등 이벤트 리스너 부착, `useEffect` 실행

**중요 포인트**
- Hydration은 **클라이언트 컴포넌트의 JS 번들**이 수행한다 (RSC payload가 하는 게 아님)
- 서버 컴포넌트는 hydration이 필요 없다 → 그 코드는 클라이언트 번들에 아예 없음

### Islands Architecture

페이지 대부분은 정적인 **바다(서버 컴포넌트)**, 상호작용이 필요한 부분만 **섬(클라이언트 컴포넌트)**. 섬만 hydration 대상.

```
┌──────────────────────────────────────┐
│   🌊 바다 (서버 컴포넌트, JS 0KB)     │
│                                      │
│   TimetableHeader                    │
│                                      │
│   🏝️ WeekTabs (섬 — hydration)       │
│                                      │
│   TimetableGrid                      │
│                                      │
│   🏝️ RefreshButton (섬 — hydration)  │
└──────────────────────────────────────┘
```

각 섬은 독립적으로 hydration된다 (한 섬이 오래 걸려도 다른 섬은 먼저 살아남).

---

## 7. 세 아티팩트의 역할 분리

| 무엇 | 누가 하나 | 쓰는 재료 |
|------|---------|----------|
| DOM 그리기 (첫 화면) | 브라우저 | **HTML** |
| 이벤트 부착 + 상태 복원 (hydration) | React | **클라이언트 컴포넌트 JS 번들** |
| React 트리 구조 이해 / 서버→클라 props 전달 | React | **RSC payload** |

기억법:
- **HTML = 첫 화면을 그린다**
- **JS 번들 = 인터랙션을 되살린다 (hydration 주체)**
- **RSC payload = 서버가 만든 트리/props 정보를 React에 전달한다**

---

## 8. 이 프로젝트의 컴포넌트 매핑

| 컴포넌트 | 타입 | 이유 |
|---------|------|------|
| `app/page.tsx` | 🟢 서버 | Sheets API 호출, 데이터 fetch |
| `TimetableHeader` | 🟢 서버 | 정적 텍스트만 |
| `TimetableGrid` | 🟢 서버 | 순수 렌더링, 상태 없음 |
| `WeekTabs` | 🔵 클라이언트 | `useState`로 현재 주차 관리 |
| `RefreshButton` | 🔵 클라이언트 | `onClick` 이벤트 + fetch |

---

## 9. BFF (Backend-For-Frontend)란

**정의**: 특정 프런트엔드의 필요에 맞춰 데이터를 가공/조합/중계하는 전용 백엔드 레이어.

### 등장 배경

도메인 API(주문 서비스, 유저 서비스 등)는 범용적으로 설계되어 있어서 프런트엔드가 원하는 형태와 다르다. 프런트엔드가 필요한 데이터를 얻으려면:
- 여러 API를 병렬 호출해서 합쳐야 하거나
- 응답에서 일부 필드만 골라내야 하거나
- 형식을 변환해야 하거나
- 외부 API 키를 숨겨야 한다

이걸 브라우저에서 직접 하면 느리고 위험하니, 프런트엔드 **옆에** 전용 서버를 둔다. 그게 BFF.

```
[웹 브라우저]  ──▶  [웹용 BFF]  ──┐
                                   ├──▶  [도메인 API들 / DB / 외부 서비스]
[iOS 앱]      ──▶  [모바일 BFF] ──┘
```

### 일반 백엔드와의 차이

| | 도메인 백엔드 (NestJS 등) | BFF |
|---|----------------------------|-----|
| 대상 | 여러 클라이언트가 공유 | 특정 클라이언트 1개 전용 |
| 관심사 | 비즈니스 로직, 데이터 정합성 | UI에 맞는 데이터 형태 제공 |
| 변경 주기 | 느림 (여러 클라이언트 영향) | 프런트엔드와 함께 변경 |
| 보유 로직 | DB 스키마, 도메인 규칙 | API 호출 조합, 필드 매핑, 인증 토큰 관리 |

### Next.js = 이미 BFF

Next.js의 서버 컴포넌트와 Route Handler는 **BFF 역할을 그대로 수행한다**:
- 서버에서 외부 API(Google Sheets) 호출
- 응답을 원하는 형태(`TimetableData`)로 가공
- API 키 숨김
- 프런트엔드(React 컴포넌트)와 같은 코드베이스에서 함께 변경

즉, **RSC는 "BFF를 컴포넌트 안에 내장한" 구조**라고 봐도 된다.

### 이 프로젝트에 대입

- 클라이언트: 웹 하나
- 도메인 API: Google Sheets (외부)
- BFF: Next.js 서버 컴포넌트 + `POST /api/revalidate`
- 도메인 백엔드: **불필요** (별도 DB나 도메인 로직 없음)

NestJS 같은 별도 서버가 필요해지는 시점은:
- 웹 + iOS + Android가 같은 도메인 로직을 공유해야 할 때
- 긴 배치 작업, WebSocket 같은 영속 연결
- 팀이 분리되어 프런트/백 생명주기를 나눠야 할 때

이 프로젝트는 그중 어느 것에도 해당하지 않으므로 Next.js 한 박스로 충분하다.
