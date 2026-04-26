# 서버 날짜 필터링 vs 클라이언트 필터링 — 캐싱 모델 선택

M16/M17 이후 시간표 캐싱이 기대와 다르게 동작하는 현상을 정리하고, 미래 회차 필터링을 어디서 처리할지 결정한 기록이다.

---

## 1. 배경

M16에서 요구사항이 추가됐다.

- Google Sheets 첫 번째 탭에 여러 회차 블록이 가로로 배치된다.
- 학생에게는 오늘 기준으로 시작된 회차까지만 보여준다.
- 미래 회차는 탭에 노출하지 않는다.

처음에는 서버에서 오늘 날짜를 기준으로 필터링했다.

```tsx
async function VisibleSessionTabs() {
  await connection()
  const allSessions = await getAllTimetableData()
  const sessions = filterVisibleSessions(allSessions, new Date())
  return <SessionTabs sessions={sessions} />
}
```

이 구조는 `new Date()`가 `cacheComponents`의 prerender와 충돌하지 않도록 만든 것이다. 자세한 배경은 `dynamic-date-with-cache-components.md`에 정리되어 있다.

---

## 2. 기존 캐싱 문제와 해결

초기에는 `/` 요청에서 쿠키 검증이 페이지 전체를 동적화했다.

원인은 다음 중 하나였다.

- `proxy.ts`가 `/`에서 쿠키를 읽음
- 또는 페이지 렌더 경계 안에서 `cookies()` 기반 인증이 시간표 로딩과 섞임

해결은 `AuthGate`를 nested Server Component로 분리하고 `<Suspense>`로 감싸는 것이었다.

```tsx
<Suspense fallback={null}>
  <AuthGate />
</Suspense>
```

이후 구조:

```txt
정적 쉘
└─ AuthGate 홀: cookies() + Upstash PIN 검증
```

핵심은 인증은 매 요청 실행하되, 시간표 HTML은 정적 쉘/캐시 경계에 남기는 것이었다.

---

## 3. M16/M17 이후 다시 생긴 문제

`filterVisibleSessions(..., new Date())`를 서버에서 실행하려면 요청 시점 날짜가 필요하다. 그래서 `VisibleSessionTabs`를 nested Server Component로 만들고 `connection()`을 호출했다.

결과 구조:

```txt
정적 쉘
├─ AuthGate 홀: 쿠키 검증
├─ Notice 홀: 공지 조회
└─ VisibleSessionTabs 홀
   ├─ connection()
   ├─ getAllTimetableData()
   ├─ filterVisibleSessions(..., new Date())
   └─ SessionTabs 렌더
```

이 구조에서 `/`는 여전히 `◐ Partial Prerender`로 빌드된다. 완전히 `ƒ Dynamic`이 된 것은 아니다.

하지만 시간표 본문이 `connection()` 아래의 동적 홀로 이동했다. 즉 원래 기대했던 "시간표 HTML이 CDN 정적 응답에 포함되고, 관리자 최신화 때만 갈아끼워지는" 모델이 약해졌다.

---

## 4. `connection()`의 의미

`connection()`은 캐시 함수가 아니다. 해당 Server Component 렌더를 요청 시점으로 미루는 선언이다.

```txt
여기부터는 실제 요청이 들어온 뒤 계산해야 한다.
빌드/prerender 시점에 고정하지 마라.
```

따라서 `connection()` 안에서 `getAllTimetableData()`를 호출하면:

- `getAllTimetableData()`의 `"use cache"`는 여전히 동작할 수 있다.
- 하지만 `VisibleSessionTabs` 렌더 결과 HTML은 정적 쉘에 박히지 않는다.
- 학생 요청마다 서버에서 동적 홀 렌더가 실행된다.

---

## 5. 두 가지 선택지

### A. 서버 날짜 필터링

```txt
Google Sheets API
→ 전체 회차 수신
→ 서버에서 오늘 날짜 기준 필터링
→ 허용된 회차만 학생 응답에 포함
```

장점:

- 미래 회차가 HTML/RSC payload/props에 포함되지 않는다.
- "응답 자체에 미래 회차가 없어야 한다"는 요구사항을 만족하기 쉽다.

단점:

- `new Date()` 때문에 요청 시점 렌더가 필요하다.
- `VisibleSessionTabs`는 동적 홀로 남는다.
- 시간표 렌더 비용이 학생 요청마다 발생한다.
- Sheets API 호출은 `"use cache"` hit이면 줄어들지만, 서버리스 런타임 캐시에 의존한다.

서버리스 환경에서의 약점:

```txt
학생 A → Function Instance #1 → cache miss → Sheets API 호출
학생 B → Function Instance #1 → cache hit
학생 C → Function Instance #2 → cache miss → Sheets API 호출 가능
```

사용자가 많아지거나 cold start/동시 접속으로 Function 인스턴스가 늘면 인스턴스별 캐시 상태가 달라질 수 있다.

### B. 클라이언트 날짜 필터링

```txt
서버/prerender
→ 전체 회차 데이터 fetch + 파싱
→ 전체 시간표 응답을 CDN에 캐시

브라우저
→ 오늘 날짜 기준으로 표시할 회차만 필터링
```

장점:

- 학생 요청이 CDN에서 끝날 수 있다.
- Vercel Function 실행이 줄어든다.
- 서버 렌더 비용이 줄어든다.
- Sheets API 호출 가능성이 관리자 최신화/캐시 재생성 시점으로 제한된다.
- 구조가 단순해진다. `connection()`이 시간표 렌더 경계에 필요 없다.

단점:

- 미래 회차 데이터가 클라이언트 응답에 포함된다.
- UI에서는 숨길 수 있지만 DevTools/RSC payload 관점에서는 완전 미노출이 아니다.

---

## 6. 왜 클라이언트 필터링을 선택하는가

이 프로젝트의 미래 회차는 시험 정답, 개인정보, 결제 권한 데이터처럼 민감도가 높은 정보가 아니다. 핵심 목적은 학생이 현재 볼 시간표를 헷갈리지 않게 하는 운영 UX다.

따라서 "미래 회차를 보안상 절대 응답에 포함하면 안 된다"보다 "학생 접속 시 빠르고 안정적으로 시간표를 보여준다"가 더 중요하다.

결정:

```txt
전체 시간표는 서버에서 fetch/parse 후 정적 캐시 대상으로 둔다.
오늘 날짜 기준 탭 필터링은 클라이언트에서 처리한다.
```

이 결정으로 포기하는 것:

- 응답 payload 수준의 미래 회차 완전 미노출

얻는 것:

- 강한 CDN 캐싱
- 학생 요청당 Function 실행 감소
- 학생 요청당 서버 렌더 감소
- Sheets API 호출 위험 감소
- `connection()`으로 시간표 렌더가 동적 홀에 들어가는 문제 제거

---

## 7. 최종 구현

서버 컴포넌트에서는 날짜 필터링을 하지 않는다.

```tsx
async function VisibleSessionTabs() {
  const sessions = await getAllTimetableData()
  return <SessionTabs sessions={sessions} />
}
```

`connection()`과 `filterVisibleSessions(..., new Date())`를 제거했다. 이로써 시간표 데이터 fetch와 렌더가 요청 시점 동적 홀 안으로 들어가지 않는다.

날짜 필터링은 `SessionTabs` 클라이언트 컴포넌트에서 직접 수행한다.

```tsx
export function SessionTabs({ sessions }: { sessions: TimetableData[] }) {
  const visibleSessions = filterVisibleSessions(sessions, new Date())
  const [current, setCurrent] = useState(() =>
    determineCurrentSession(visibleSessions)
  )
  const data = visibleSessions[current]

  // ...
}
```

빌드 결과에서 `/`는 여전히 `◐ Partial Prerender`로 표시된다. 이는 `AuthGate`와 공지 같은 동적 홀이 남아 있기 때문이다. 중요한 변화는 시간표 영역에서 `connection()`을 제거해, 시간표 렌더가 별도의 요청 시점 동적 홀에 묶이지 않는다는 점이다.

---

## 8. hydration mismatch 판단

처음에는 클라이언트에서만 날짜 필터를 켜기 위해 `isClient` 플래그를 고려했다.

```tsx
const visibleSessions = isClient
  ? filterVisibleSessions(sessions, new Date())
  : sessions
```

이 방식은 서버 프리렌더에서는 전체 회차를 렌더하고, 브라우저 연결 후에만 필터링한다. hydration mismatch를 더 엄격하게 피할 수 있지만 코드가 복잡해진다. 특히 `useEffect(() => setMounted(true), [])` 패턴은 이 프로젝트의 ESLint 규칙(`react-hooks/set-state-in-effect`)에 걸려 `useSyncExternalStore` 같은 우회가 필요했다.

최종적으로는 이 복잡도를 들이지 않기로 했다.

이유:

- 미래 회차는 보안상 민감 데이터가 아니다.
- 서버 프리렌더 시점에 날짜 필터링이 들어가도 기능상 문제가 작다.
- 서버 렌더 날짜와 브라우저 hydration 날짜가 달라지는 mismatch는 자정 근처 edge case다.
- 이 edge case를 피하려고 `useSyncExternalStore`를 도입하는 것은 현재 프로젝트 규모에서는 과하다.

따라서 단순한 `new Date()` 직접 호출을 선택했다. 이 선택의 핵심은 "완벽한 hydration edge case 방어"보다 "캐싱 구조 회복과 코드 단순성"을 우선한 것이다.

---

## 9. 향후 대안

미래 회차 미노출이 나중에 정말 중요해지면 세 번째 방식이 필요하다.

```txt
공개된 회차 상태를 별도로 관리
→ 관리자 "공개" 버튼 또는 cron으로 공개 상태 갱신
→ 공개된 회차만 정적 캐시 재생성
```

이 방식은 보안성과 CDN 캐싱을 같이 얻을 수 있지만, 별도 관리 상태와 운영 절차가 필요하다. 현재 단계에서는 과한 복잡도다.

---

## 10. 관련 문서

- `dynamic-date-with-cache-components.md` — `new Date()`와 `connection()` 분리 배경
- `proxy-caching-patterns.md` — `AuthGate`를 Suspense 홀로 분리한 이유
- `use-cache-and-tags.md` — `"use cache"`와 `revalidateTag`의 역할
- `caching-strategy.md` — On-demand Revalidation 선택 배경
