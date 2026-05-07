# AuthGate를 parent wrapper로 두는 이유

미들웨어를 떼고 인증을 React tree 안의 서버 컴포넌트(`AuthGate`)로 옮길 때, 보호 대상 컴포넌트와 어떻게 배치할지가 다음 문제다. 두 가지 후보가 있다 — sibling Suspense 구조와 parent wrapper 구조. 결론은 parent wrapper가 안전하다.

---

## 1. Sibling Suspense 구조

`AuthGate`와 보호 대상을 나란히 둔다.

```tsx
<Suspense fallback={null}>
  <AuthGate />
</Suspense>

<Suspense fallback={null}>
  <NoticeBanner />
</Suspense>

<Suspense fallback={<TimetableLoading />}>
  <VisibleSessionTabs />
</Suspense>
```

이 구조의 의도는 캐시/prerender 경계를 세밀하게 나누는 것이다. `NoticeBanner`와 `VisibleSessionTabs`가 별도 prerender 조각 후보가 되어 Full Route Cache 효과를 더 받을 수 있다.

### 문제 1 — 인증 실패 시 보호 subtree가 병렬로 시작됨

React/Next는 sibling Suspense subtree를 병렬로 시작할 수 있다. 인증 실패로 `AuthGate`가 redirect를 결정하는 동안에도 `VisibleSessionTabs`는 이미 `getAllTimetableData()`를 시작한 상태일 수 있다.

```
AuthGate         → 인증 실패 결정
VisibleSessionTabs → 동시에 getAllTimetableData() 실행 중
```

보호 대상 데이터가 인증 실패 요청에서도 fetch된다. 데이터 자체가 민감하다면 보안 문제다.

### 문제 2 — 서버 redirect와 RSC stream 충돌

`AuthGate`가 서버 `redirect()`를 throw하면 진행 중인 RSC stream이 끊긴다. dev에서 `Connection closed` / `VisibleSessionTabs [Prerender]` 류 오류가 나온다.

```
AuthGate → redirect() throw
  └─ 서버 컴포넌트 응답 중단
VisibleSessionTabs → 이미 stream 중
  └─ 응답 완료 못 함 → Connection closed
```

`PinRedirect` 같은 클라이언트 이동 컴포넌트를 반환하면 throw 자체는 피할 수 있지만, 보호 subtree가 실행됐다는 구조적 문제는 남는다.

---

## 2. Parent Wrapper 구조

`AuthGate`가 보호 대상의 부모로 children을 감싼다.

```tsx
<Suspense fallback={<TimetableLoading />}>
  <AuthGate>
    <NoticeBanner />
    <VisibleSessionTabs />
    <GuideLink />
  </AuthGate>
</Suspense>
```

```tsx
export async function AuthGate({ children }: { children?: React.ReactNode }) {
  const pin = (await cookies()).get("student_pin")?.value
  const storedPin = await getStoredPin()

  if (!storedPin || pin !== storedPin) {
    return <PinRedirect />
  }

  return children ?? null
}
```

인증 실패 시 children을 렌더하지 않는다. `VisibleSessionTabs`가 시작조차 안 한다.

### 보호 흐름

```
AuthGate 실행
  → 인증 통과? 
      Yes → children 렌더 → getAllTimetableData() 호출
      No  → <PinRedirect /> 반환, children 미렌더
```

`VisibleSessionTabs`의 RSC payload는 prerender 조각으로 남기 어렵다 (parent가 dynamic이면 children도 dynamic subtree). 하지만 `getAllTimetableData()`의 Data Cache는 그대로 작동하므로 외부 API 호출은 여전히 캐시로 보호된다.

---

## 3. 두 구조 비교

| 측면 | sibling | parent wrapper |
|------|---------|----------------|
| 인증 실패 시 보호 subtree 실행 | 시작될 수 있음 | 시작 안 됨 |
| 서버 `redirect()` throw 시 | RSC stream 충돌 위험 | 위험 낮음 (children 자체가 안 그려짐) |
| 시간표 RSC prerender 조각 | 가능 | 어려움 |
| 시간표 Data Cache | 가능 | 가능 |
| 외부 Sheets API 호출 빈도 | 캐시 hit이면 0회 | 캐시 hit이면 0회 |

prerender 조각 손실은 RSC payload 직렬화를 매 요청 다시 한다는 뜻이지 외부 API 호출이 늘어나는 게 아니다. Sheets API 같은 가장 비싼 비용은 Data Cache로 동일하게 보호된다.

운영 우선순위에서 보면:

1. 인증 실패 시 보호 subtree가 실행되지 않아야 한다.
2. 외부 API 호출이 학생 요청마다 반복되면 안 된다.
3. dev에서 즉시 fresh로 보이는 prerender-level SWR은 필수가 아니다.

→ parent wrapper가 1, 2를 만족하고 3을 포기한다. 운영 구조로는 이쪽이 맞다.

---

## 4. Suspense fallback 전략

parent wrapper 구조에서 Suspense는 하나로 통합된다.

```tsx
<Suspense fallback={<TimetableLoading />}>
  <AuthGate>...</AuthGate>
</Suspense>
```

fallback은 시간표 로딩 스피너로 통일한다. 인증 검사 단계는 짧고(쿠키 + Redis 1회), 시간표 캐시 hit이면 거의 즉시 resolve된다. 실제로 fallback이 의미 있게 보이는 경우는 캐시 entry가 아예 없을 때(콜드 부팅 후 첫 접속)뿐이다.

---

## 5. 정리

> sibling 구조는 prerender 조각까지 살릴 수 있는 캐시 실험 구조다. parent wrapper 구조는 보호 subtree 실행을 보장하는 운영 구조다. 인증으로 데이터 접근 자체를 차단해야 한다면 parent wrapper가 정답이다.
