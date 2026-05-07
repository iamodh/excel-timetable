# 쿠키/헤더가 라우트를 동적으로 만드는 매커니즘

`cookies()`, `headers()` 같은 API는 Next.js에서 **Request-time API**로 분류된다. 요청마다 값이 달라지므로, Next.js는 이 API를 호출한 코드가 포함된 라우트를 자동으로 동적 렌더링으로 강제한다. 이 분류는 단순한 힌트가 아니라 빌드/런타임 동작을 결정한다.

---

## 1. 동적/정적 분류의 결과

Next.js 빌드 로그는 라우트마다 마커를 표시한다.

```
○  Static     — 빌드 시점에 prerender, 모든 사용자에게 같은 HTML
ƒ  Dynamic    — 요청마다 서버에서 렌더
●  SSG        — 빌드 시점 prerender (generateStaticParams)
```

라우트가 `ƒ`로 분류되면:

- 빌드 시점 prerender가 사라진다.
- 매 요청마다 서버 컴포넌트가 다시 실행된다.
- 페이지 단위 `export const revalidate = ...` 설정이 무시된다.

`revalidate = false`는 "정적 prerender 결과를 자동 갱신하지 마라"는 의미이지, "동적이어도 정적으로 만들라"는 의미가 아니다. 동적으로 분류된 라우트는 애초에 정적 prerender 결과가 없으므로 `revalidate` 설정의 적용 대상이 아니다.

---

## 2. 미들웨어(proxy)의 영향

Next.js 16에서 `middleware.ts`는 `proxy.ts`로 리네임됐다. 이름만 바뀌었고 캐싱에 미치는 영향은 동일하다.

미들웨어가 `request.cookies`나 `request.headers`를 읽으면, 매처에 걸린 경로 전체가 동적으로 분류된다. 이때 핵심 특성:

- **미들웨어는 자기 자신을 opt-out 할 수 없다.** 미들웨어 본문이 실행되는 시점에는 Next.js가 이미 그 경로를 "요청마다 달라질 수 있음"으로 판정한 상태다. 본문에서 "쿠키 있으면 건너뛰기" 같은 early-return을 해도 정적 캐싱은 돌아오지 않는다.
- **페이지의 `revalidate` 설정은 미들웨어에 의해 오버라이드된다.** 페이지가 정적 의도로 선언되어 있어도 미들웨어 매처에 걸린 경로는 동적이 된다.
- **매처 조건(`has`, `missing`)으로 우회 가능 여부는 버전별 실측이 필요하다.** "쿠키가 없는 요청만 미들웨어를 타게" 하는 패턴은 이론상 가능하지만 정적 판정에 어떻게 반영되는지 보장하기 어렵다.

---

## 3. 페이지 안에서 직접 읽는 경우

```tsx
import { cookies } from "next/headers"

export default async function Page() {
  const c = await cookies()
  const pin = c.get("student_pin")?.value
  // ...
}
```

이 경우에도 라우트는 동적으로 분류된다. 미들웨어 여부와 무관하다. `cookies()` 호출 자체가 동적화 트리거다.

다만 **호출 위치를 Suspense 경계 안쪽으로 격리하면** 페이지의 정적 shell은 prerender 가능 상태로 유지할 수 있다. 이 패턴은 Cache Components 모드(`cacheComponents: true`)에서만 의미가 있다 — legacy 모델에서는 라우트 단위로만 동적/정적이 갈리기 때문에 Suspense로 감싸도 페이지 전체가 동적이 된다.

---

## 4. 동적 라우트와 데이터 캐시는 별개의 축

라우트가 동적으로 분류되어도, 그 안에서 호출하는 데이터 함수는 별도로 캐시될 수 있다. 동적 분류는 "페이지 렌더 결과를 prerender하지 않는다"는 의미일 뿐이다. 외부 API 호출 결과를 함수 단위로 캐싱하는 것과는 다른 레이어다.

```
라우트 동적 (cookies 사용)
  └─ 매 요청 컴포넌트 재실행
      └─ "use cache" 함수 호출 → Data Cache hit 가능
          └─ 외부 API는 호출되지 않음
```

이 구분이 미들웨어 캐싱 문제의 해결 핵심이다. 페이지를 정적으로 만드는 것을 포기하더라도, 가장 비싼 외부 API 호출은 데이터 함수 단위로 캐시할 수 있다.

---

## 5. 정리

| 상황 | 라우트 분류 | 비싼 외부 API 호출 빈도 |
|------|-------------|------------------------|
| 미들웨어가 `/`에서 쿠키 읽음 + 데이터 함수 캐시 없음 | Dynamic | 매 요청 |
| 미들웨어가 `/`에서 쿠키 읽음 + 데이터 함수에 `"use cache"` | Dynamic | 캐시 무효화 후 1회 |
| 미들웨어 매처에서 `/` 제외 + 페이지 안에서 쿠키 안 읽음 | Static | 무효화 후 1회 (prerender에 baked in) |
| 미들웨어 매처에서 `/` 제외 + 페이지 Suspense 안에서 쿠키 읽음 (Cache Components) | Dynamic shell-out (hole만 dynamic) | 무효화 후 1회 |
