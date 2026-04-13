# Next.js 렌더링 방식의 진화와 CDN

`rsc-architecture.md`가 "RSC가 무엇인가"를 다룬다면, 이 문서는 **"왜 이렇게 진화했고, CDN과 어떻게 맞물리는가"** 를 정리한다.

---

## 1. React의 세 가지 고질병

기존 CRA(Create React App) 방식의 SPA가 안고 있던 문제는 세 가지였다:

1. **메인 번들 로드 대기** — 빈 HTML(`<div id="root"></div>`)을 먼저 받고, 큰 JS 번들 다운로드/실행이 끝나야 화면이 보임. 모바일·느린 네트워크에서 심각.
2. **크롤러/링크 프리뷰 불가** — 크롤러(구글봇 일부, 카카오톡 OG 파서, 네이버 등)는 JS를 실행하지 않거나 제한적으로만 함. 빈 HTML만 받아서 내용을 읽지 못함.
3. **"서버 필요"의 번거로움** — 데이터 페칭/비밀값 사용을 위해 Express/Nest 같은 서버를 따로 세팅해야 함 (CORS, API 스펙 중복, 배포 파이프라인 2개).

Next.js는 이 세 문제를 **시간 순서대로** 단계별로 풀어왔다.

---

## 2. 3단계 진화

### 1단계: SSR (Next 초기 ~ v8)

**변경점:** 매 요청마다 서버에서 React를 렌더링해 완성된 HTML을 전송.

```
요청 → 서버가 React 렌더 → HTML 응답 → 브라우저 표시 → hydration
```

**해결**
- ✅ 첫 화면 공백 해결 (HTML이 먼저 옴)
- ✅ 크롤러 읽기 가능
- ✅ `getServerSideProps`로 서버 코드 직접 작성 가능

**남은 문제**
- 매 요청마다 서버가 렌더링 → 서버 비용·TTFB 느림
- 매 요청마다 데이터 소스 호출 → rate limit/요금 폭탄
- 지리적으로 멀면 느림
- **번들 크기는 그대로** (hydration 위해 전체 JS 번들 여전히 전송)

### 2단계: SSG + ISR (Next 9~12)

**변경점:** 빌드 시 HTML을 미리 만들어 CDN에 배포. 사용자는 CDN에서 즉시 받음.

```
[빌드 시 1번]
서버가 React 렌더 → HTML 생성 → CDN 업로드

[런타임]
요청 → 가까운 CDN 엣지 → 캐시된 HTML 즉시 응답 (10ms)
```

**해결**
- 렌더링이 빌드 시 1번으로 끝남
- 데이터 소스 호출도 빌드 시 1번
- CDN이 전 세계 엣지에서 서빙 → TTFB 거의 0
- 서버 부하가 트래픽과 무관

**ISR(Incremental Static Regeneration)**: "일정 시간마다 백그라운드 재생성" 옵션. 예: 60초마다 재생성 시 최대 60초 지연으로 데이터 갱신.

**남은 문제**
- **번들 크기는 여전히 그대로** — hydration을 위해 모든 컴포넌트 JS가 클라이언트로 내려감
- 런타임 동적 데이터는 여전히 클라이언트 fetch 필요

### 3단계: RSC + App Router (Next 13~)

**변경점:** 컴포넌트를 **서버 전용 / 클라이언트 전용**으로 명확히 분리. 서버 컴포넌트의 코드는 클라이언트 번들에 포함되지 않음.

**해결**
- ✅ 번들 크기 근본 해결 — 상호작용 없는 컴포넌트의 JS는 브라우저에 0KB
- ✅ 데이터 페칭이 `async function` 컴포넌트 안으로 들어옴 → `useEffect` + 3-state 불필요
- ✅ 비밀값을 서버 컴포넌트에서 직접 사용 가능
- ✅ 2단계의 CDN 캐시 메커니즘 그대로 상속 + 확장 (RSC payload, fetch 결과까지 캐시)

**중요:** RSC는 CDN을 대체한 게 아니다. **2단계에서 쌓아온 CDN 캐싱 위에 번들 크기 최적화를 얹은 것.** CDN은 계속 쓰이고, 오히려 더 다양한 아티팩트(HTML, JS, RSC payload, 이미지)가 캐시된다.

### 단계별 진화 요약

| 단계 | 첫 화면 | 크롤러 | 서버 번거로움 | 번들 크기 |
|-----|---------|--------|---------------|----------|
| CRA (기준) | ❌ 빈 HTML | ❌ 못 읽음 | ❌ 서버 별도 | ❌ 큼 |
| 1단계 SSR | ✅ | ✅ | 🟡 Next가 통합 | ❌ 그대로 |
| 2단계 SSG/ISR | ✅✅ (엣지) | ✅ | 🟡 | ❌ 그대로 |
| 3단계 RSC | ✅✅ | ✅ | ✅ async 컴포넌트 | ✅ 작음 |

---

## 3. "JSX가 전송된다"는 오해 정정

흔한 오해: "1/2단계에서는 JSX가 다 전송됐다."

정확히는:
- **JSX는 브라우저가 이해하지 못함.** 빌드 시 `React.createElement(...)` 호출로 컴파일됨.
- 전송되는 건 **컴파일된 JS 번들**이며, 그 안에 모든 컴포넌트의 렌더링 로직이 들어 있음.
- 1/2단계의 문제는 "JSX가 전송됐다"가 아니라 **"hydration을 위해 모든 컴포넌트 코드가 번들에 들어가야 했다"**.

---

## 4. 옛날 React에는 async 컴포넌트가 없었다

RSC 이전의 React 컴포넌트는 **항상 동기 함수**였다. `async function Component()`는 React 19의 서버 컴포넌트에서 처음 가능해진 것.

### 옛날 데이터 페칭 패턴

**(a) 클래스 컴포넌트 + 생명주기**
```jsx
componentDidMount() {
  fetch("/api/...").then(r => r.json()).then(data => this.setState({ data }))
}
```

**(b) 함수 컴포넌트 + 훅**
```jsx
useEffect(() => {
  fetch("/api/...").then(r => r.json()).then(setData)
}, [])
```

**(c) 라이브러리 (React Query / SWR)**
```jsx
const { data, isLoading, error } = useQuery("key", fetcher)
```

**공통 문제:**
- 컴포넌트는 항상 "빈 상태"로 먼저 렌더 → 데이터 도착 후 재렌더 (최소 2회)
- 모든 페칭 지점마다 `loading / success / error` 3-state 관리
- Waterfall: 부모가 데이터 받은 후에야 자식이 페칭 시작 → 연쇄 지연

### React 18의 과도기 — `use()` + Suspense

"컴포넌트가 Promise를 던지면 Suspense가 잡는다"는 트릭. 겉은 `await`처럼 보이지만 함수 자체는 여전히 동기. React가 컴포넌트를 여러 번 실행하며 Promise 해결 여부를 체크.

### RSC의 진짜 차이

```jsx
// 서버 컴포넌트에서만 가능
export default async function Page() {
  const data = await fetchTimetableData()  // 진짜 await
  return <Grid data={data} />              // Promise<JSX.Element> 반환
}
```

- 함수 선언 자체가 `async function`
- 서버에서만 실행되므로 "응답 만들기 전까지 기다릴 수 있음"
- 클라이언트 컴포넌트는 여전히 `async function`일 수 없음 (브라우저는 화면을 계속 그려야 하므로)

---

## 5. CDN 이해

### CDN이란

**Content Delivery Network** — 전 세계 여러 지역에 분산된 엣지 서버 네트워크. 사용자와 가장 가까운 엣지에서 콘텐츠를 서빙해 RTT(왕복 시간)를 줄인다.

```
[한국 사용자] ──▶ [서울 엣지] ≈ 5ms
[한국 사용자] ──▶ [미국 버지니아 서버] ≈ 180ms
```

### CDN에 담기는 것 (Next 기준)

| 아티팩트 | 언제 등장 |
|---------|----------|
| 정적 에셋 (JS 번들, CSS, 이미지, 폰트) | 오래 전부터 |
| SSG/ISR로 만든 HTML | 2단계부터 |
| **RSC payload** | 3단계부터 |
| **fetch 결과 (Data Cache)** | 3단계부터 |

### 1단계 SSR에서는 왜 HTML을 CDN에 못 올렸나

매 요청마다 서버가 새로 렌더링 → 사용자·쿠키·쿼리마다 결과가 다를 수 있음 → CDN이 캐시 키를 잡기 어려움. 그래서 HTML은 원본 서버에서 매번 생성되고, CDN은 정적 에셋만 담당했음.

SSG는 "빌드 시 HTML이 확정됨"이라는 전제가 있어 모든 사용자에게 같은 HTML을 줄 수 있음 → CDN 캐시가 가능해짐.

### 주요 CDN 사업자

| 사업자 | 특징 |
|--------|------|
| Cloudflare | 글로벌 점유율 최대, 무료 플랜 |
| AWS CloudFront | AWS 생태계 연동 |
| Vercel Edge Network | Next.js 최적화, Cloudflare 위에 구축 |
| Akamai | 기업용 전통 강자 |
| Fastly | 개발자 친화적 |

각 사업자는 전 세계 수십~수백 개 도시에 물리 서버를 운영한다. Vercel은 100개 이상 지역(서울, 도쿄, 프랑크푸르트, 상파울루 등).

---

## 6. Next + Vercel의 자동 CDN 배포

**핵심: Next 자체가 CDN을 만드는 게 아니라, 배포 플랫폼이 Next의 빌드 결과를 자동으로 CDN에 올려준다.**

### Vercel 배포 시 자동으로 일어나는 일

```
[개발자 Mac]                    [Vercel]
git push ────────────────────▶ 
                                  │ 1. next build
                                  │ 2. HTML/JS/CSS/이미지 생성
                                  │
                                  ├─▶ [Vercel Edge Network (CDN)]
                                  │    ├─ 서울 엣지
                                  │    ├─ 도쿄 엣지
                                  │    └─ ... 100+ 지역
                                  │
                                  └─▶ [Serverless Function]
                                       └─ /api/revalidate 핸들러
```

- 정적 자산 → 엣지에 자동 배포
- SSG/ISR 페이지 → 엣지에 자동 배포
- 서버 렌더링 필요 부분 → Serverless Function으로 자동 배포
- `revalidatePath()` → 전 세계 엣지 캐시 자동 무효화

개발자는 **CDN 설정을 직접 안 건드려도 된다.** 이게 Next + Vercel 조합의 핵심 가치.

### 다른 플랫폼 (AWS, 자체 서버)

자동이 아님. 직접 해야 함:
- `next build` → `next start`로 Node 서버 실행
- Nginx/ALB 앞단 배치
- CloudFront 등 CDN 직접 연결 및 캐시 정책 설정
- On-demand Revalidation 웹훅 직접 구현

**이 프로젝트(excel-timetable)는 TECHSPEC § 4.1에 따라 Vercel을 선택했으므로 M8 배포 시 위 모든 것이 자동으로 세팅된다.**

---

## 7. Next의 4단계 캐시 레이어

요청이 들어오면 위에서 아래로 내려가며 "캐시 있음 → 즉시 응답, 없음 → 한 층 더 내려감".

```
[브라우저 캐시]
     ▲
     │
[Vercel Edge (CDN)]       ← HTML, 정적 에셋, RSC payload
     ▲
     │
[Full Route Cache]         ← 서버에 저장된 렌더링 결과
     ▲
     │
[Data Cache]               ← fetch 결과
     ▲
     │
[원본 데이터 (Google Sheets API)]
```

대부분의 요청은 **Edge에서 끝난다.** 원본까지 가는 경우는 `revalidatePath()` 호출 후 첫 요청 정도.

---

## 8. 클라이언트 → 서버 → CDN 의 revalidation 흐름

### 흔한 오해

"클라이언트 컴포넌트가 API 재호출해서 CDN payload를 업데이트한다."

### 정확한 이해

**CDN payload는 오직 서버만 갱신할 수 있다.** 클라이언트 컴포넌트는 "서버에게 갱신해달라고 요청"만 한다. 보안상 당연한 제약 — 브라우저가 CDN을 직접 쓸 수 있으면 캐시 포이즈닝 공격이 가능.

### 이 프로젝트의 최신화 버튼 흐름 (M9)

```
[RefreshButton (클라이언트 컴포넌트)]
       │
       │ onClick
       ▼
       fetch("/api/revalidate", { method: "POST" })
       │
       ▼
[Route Handler (서버)]
       │
       │ rate limit 통과
       ▼
       revalidatePath("/")          ← 여기가 CDN 무효화
       │
       ▼
[Vercel Edge]
       │ 기존 캐시에 "낡음" 표시만
       ▼
[다음 요청이 들어올 때]
       │
       ▼
       서버가 page.tsx 재렌더링
       → 새 HTML + 새 RSC payload 생성
       → 엣지에 새 캐시 저장
       ▼
[이후 모든 요청은 새 캐시로 응답]
```

### 중요한 디테일 3가지

1. **클라이언트는 "요청"만.** 실제 payload 업데이트는 서버가 한다.
2. **`revalidatePath()`는 "낡음 표시"만.** 실제 새 payload 생성은 다음 요청이 올 때 발생.
3. **클라이언트 컴포넌트의 일반 `fetch()`는 CDN payload와 무관.** 그 응답은 브라우저 메모리의 state에 들어갈 뿐.

### 클라이언트 컴포넌트가 할 수 있는 일 3가지

| 동작 | 주체 | CDN payload 관계 |
|------|------|------------------|
| `setState` 등 자기 상태 변경 | 클라이언트 | 무관 (브라우저 메모리) |
| 일반 `fetch()`로 외부 API 호출 | 클라이언트 | 무관 (CDN 거치지 않음) |
| 서버의 revalidation 엔드포인트 호출 | 클라이언트 → 서버 | 서버가 CDN 갱신 |

---

## 9. 정리된 멘탈 모델

> Next는 서버 컴포넌트가 DB/API에서 가져온 데이터로 JSX를 렌더링한 뒤, 그 결과를 **HTML + RSC payload** 두 포맷으로 직렬화해 **CDN 엣지에 저장**한다.
>
> 브라우저는 가까운 엣지에서 HTML로 첫 화면을 즉시 그리고, 같은 엣지에서 JS 번들과 RSC payload를 가져와 React 트리를 복원한 뒤 **인터랙티브 섬(클라이언트 컴포넌트)만 hydration**한다.
>
> 서버 컴포넌트와 클라이언트 컴포넌트가 **컴파일러 레벨에서 엄격히 구분**되기 때문에, 서버 코드는 클라이언트 번들에 들어가지 않아 **번들 크기가 작다**.
>
> 데이터가 바뀌면 **클라이언트 컴포넌트가 서버의 revalidation 엔드포인트를 호출**하고, **서버가 `revalidatePath`로 CDN 캐시를 무효화**한다. 다음 요청이 들어오는 시점에 서버가 다시 렌더링해 새 HTML/RSC payload를 만들어 엣지에 저장한다.

이 멘탈 모델을 들고 M5~M9 구현에 들어가면, 각 코드 조각이 어느 층(서버 컴포넌트 / 클라이언트 섬 / Route Handler / CDN 캐시)에 해당하는지 즉시 매핑할 수 있다.
