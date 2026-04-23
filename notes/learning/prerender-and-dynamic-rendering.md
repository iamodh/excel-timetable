# Prerender와 동적 렌더링 — "언제 도는가" 축

`nextjs-rendering-and-cdn.md`가 CRA → SSR → SSG/ISR → RSC 로 이어지는 **역사적 진화**를 다룬다면, 이 문서는 RSC 시대 안에서 **한 페이지의 각 조각이 "언제" 렌더되는지**의 축을 정리한다. `cacheComponents: true` 모델에서 prerender와 동적 렌더링이 공존하는 방식을 이해하려면 이 축을 먼저 분리해둬야 한다.

---

## 1. 두 축은 서로 독립이다

컴포넌트를 분류할 때 자주 섞어 쓰는 두 축이 사실은 직교한다.

### 축 1 — 어디서 도는가 (Server vs Client)

| 구분 | 실행 위치 | 역할 |
|------|----------|------|
| Server Component | 서버에서만 | 데이터 페칭 + JSX 직렬화. 클라이언트 번들에 코드 0KB |
| Client Component | 서버 1회(초기 HTML) + 브라우저(hydration 이후) | 상호작용, state, 이벤트 핸들러 |

### 축 2 — 언제 서버 렌더링이 일어나는가 (Prerender vs Dynamic)

| 구분 | 실행 시점 | 결과 재사용 |
|------|----------|------------|
| Prerender (정적) | 빌드 시점 또는 revalidate 시점에 1회 | **N명의 사용자가 같은 결과** (HTML + RSC payload를 CDN에 얼려둠) |
| Dynamic | 요청마다 | 매번 새로 직렬화, 캐시 안 함 |

**두 축은 독립이다.** Server Component도 prerender될 수 있고 dynamic으로 돌 수도 있다. Client Component도 초기 HTML을 prerender해두고 hydration은 브라우저에서 일어날 수 있다.

혼동 예:
- "동적 렌더링 = 클라이언트 컴포넌트" ❌ — 동적 렌더링은 **서버에서** 요청마다 코드가 도는 것. 브라우저 실행과 무관.
- "Server Component는 항상 정적" ❌ — `cookies()` / `headers()` / `new Date()` 등을 쓰면 Server Component도 dynamic이 된다.

---

## 2. Prerender가 성립하기 위한 조건

Prerender는 단순히 "서버에서 렌더한다"가 아니라 **"서버에서 한 번 렌더한 결과를 N명에게 재사용한다"** 는 전략이다. 성립하려면 한 가지 전제가 필요하다:

> **실행 시점에 무관하게 같은 결과가 나와야 한다.**

이 전제를 깨는 값들:
- `cookies()`, `headers()` — 사용자마다 다름
- `new Date()` — 시점마다 다름
- `Math.random()` — 호출마다 다름
- `connection()` — 요청 객체에 의존

이런 값을 prerender 경로에서 만나면 Next.js는 **직렬화를 거부한다**. 빌드 시점에 `new Date()`를 실행해 HTML에 박아버리면 "오늘"이 빌드 날짜로 영영 고정되기 때문 — 의미론적으로 틀린 결과.

```
// 만약 Next.js가 거부하지 않는다면
빌드 시 2026-04-23 → HTML에 "오늘: 2026-04-23" 박힘 → CDN 저장
→ 한 달 뒤 사용자 접속해도 "오늘: 2026-04-23" 그대로 ❌
```

---

## 3. 동적 렌더링이란

동적 렌더링 = 해당 조각을 **매 요청마다 서버에서 새로 실행**하는 것.

```
요청 → 서버가 그 조각의 async function 실행
     → 데이터 페칭 + JSX 직렬화
     → HTML/RSC payload 응답
     → 재사용 안 함, 다음 요청은 또 처음부터
```

- 여전히 **서버에서** 실행됨. 브라우저가 아니다.
- 결과물도 여전히 HTML + RSC payload. 포맷은 동일.
- 차이는 **재사용 여부** 뿐. prerender는 얼려서 N명에게 공유, dynamic은 매번 새로.

---

## 4. `cacheComponents: true` 모델에서의 위치

Next.js 16의 `cacheComponents` 모드(= PPR의 후속)는 두 축 중 **축 2를 컴포넌트 단위로 섞을 수 있게** 한다.

- 기본값: **동적** (opt-in 캐시)
- 캐시하려면 함수에 `"use cache"` 명시 (`use-cache-and-tags.md` 참조)
- 페이지 안에 정적 조각(prerender)과 동적 조각이 공존 가능 → 쉘과 홀 구조 (`shell-and-hole.md` 참조)

이 모델에서 주의할 점:
- `cookies()` / `new Date()` 같은 동적 값은 **반드시** Suspense 경계 안쪽에서 써야 한다. 쉘에서 쓰면 쉘 전체가 dynamic으로 번져 prerender 불가.
- 동적임을 명시하려면 `connection()` 등 request-time API를 먼저 호출해 Next.js에 "이 렌더는 요청 시점"이라고 알린다.

실전 사례: `problem-solving/dynamic-date-with-cache-components.md`

---

## 5. 자주 혼동되는 포인트

### "직렬화는 prerender에서만 일어난다"
아니다. **dynamic 렌더링도 똑같이 직렬화**한다. 포맷도 같은 HTML + RSC payload. 차이는 "언제" 직렬화하고 "재사용하냐"일 뿐.

### "dynamic이면 캐시가 안 되는 거 아닌가"
컴포넌트 레벨에서는 재사용 안 됨이 맞지만, 그 안에서 호출하는 **함수 레벨 캐시**(`"use cache"`)는 독립적으로 작동한다. dynamic 컴포넌트가 cached 함수를 호출해 결과만 캐시에서 받는 구조가 정상 패턴.

### "Client Component면 브라우저에서만 렌더되는 거 아닌가"
초기 HTML은 서버에서 만든다. 브라우저는 hydration부터 담당. "Client" 이름은 **상호작용 주체**를 가리키지 실행 위치를 가리키지 않는다.

### "prerender는 빌드 시점에만 일어나는가"
아니다. `revalidateTag` / `revalidatePath` 호출 후 다음 요청이 트리거되는 시점에도 prerender가 일어난다 ("on-demand prerender"). 결과물은 똑같이 CDN에 캐시되어 이후 요청들에 재사용.

---

## 6. 관련 문서

- `nextjs-rendering-and-cdn.md` — 진화 단계(1~3), CDN과의 관계
- `shell-and-hole.md` — 한 페이지에 정적/동적 섞는 구체적 모델
- `problem-solving/use-cache-and-tags.md` — 함수 레벨 캐시 선언
- `problem-solving/dynamic-date-with-cache-components.md` — 이 개념을 몰라서 겪은 2단계 에러
