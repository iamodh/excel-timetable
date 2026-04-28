# AuthGate 구조별 렌더링/캐싱 정리

이 문서는 `/` 홈 페이지 인증 구조를 `proxy -> sibling Suspense -> AuthGate wrapper` 순서로 바꾸며 관찰한 렌더링, 캐싱, SWR 차이를 정리한다.

핵심 결론:

- `prerender cache`는 데이터 자체가 아니라 **렌더된 UI 결과물(HTML/RSC payload)** 을 저장한다.
- `"use cache"`는 `getAllTimetableData()` 같은 **데이터 함수 반환값**을 저장한다.
- sibling 구조에서는 시간표 데이터로 만든 `SessionTabs` UI가 별도 prerender 조각 후보가 된다.
- wrapper 구조에서는 `AuthGate` 아래가 dynamic subtree가 되므로 시간표 UI 조각은 prerender되지 않고, 데이터 함수 캐시만 남는다.
- 보호된 데이터는 `AuthGate`의 children으로 두는 wrapper 구조가 더 명확하다.

---

## 1. 용어 정리

### Data Cache

`"use cache"` 함수의 반환값을 저장하는 서버 캐시.

```ts
export async function getAllTimetableData() {
  "use cache"
  cacheTag("timetable")
  return ...
}
```

여기에는 `TimetableData[]` 같은 raw 데이터가 저장된다.

### Prerender Cache / Full Route Cache

컴포넌트를 실행해 만든 렌더 결과를 저장한다.

```tsx
async function VisibleSessionTabs() {
  const sessions = await getAllTimetableData()
  return <SessionTabs sessions={sessions} />
}
```

이 boundary가 prerender 대상이면, `SessionTabs`의 RSC payload가 캐시된다. 즉 데이터로 만든 테이블 UI 결과물이 저장된다.

### Dynamic Hole

`cookies()`, `headers()`, uncached async 작업처럼 요청 시점 값에 의존하는 영역. 이 영역은 build/prerender 시점에 실제 결과를 확정할 수 없고, 요청마다 렌더된다.

---

## 2. 구조 변화

## 2.1 Proxy 인증 구조

`baf5d4e` 이전 구조.

```txt
request /
→ proxy.ts에서 request.cookies 읽음
→ PIN 불일치 시 /pin redirect
→ 통과하면 app/page.tsx 렌더
→ page top-level에서 getAllTimetableData(), getNotice() 호출
```

당시 `getAllTimetableData()`에는 `"use cache"`가 없었다.

```ts
export async function getAllTimetableData() {
  const spreadsheet = await fetchTimetableData()
  return ...
}
```

그래서 `/`에 들어갈 때마다 Google Sheets API 호출이 발생했다.

정확한 원인은 두 가지가 겹친 것이다.

- `proxy.ts`가 `/`에서 쿠키를 읽어 route 전체를 request-specific하게 만들었다.
- 동시에 `getAllTimetableData()`가 `"use cache"`로 보호되지 않았다.

`proxy + use cache` 조합은 별도 실험하지 않았다. 이론적으로는 `/` route 자체는 dynamic 성격을 갖더라도, `getAllTimetableData()`의 data cache는 동작할 가능성이 있다. 다만 proxy는 React tree 바깥에서 쿠키 의존성을 걸기 때문에 Suspense/PPR 경계를 세밀하게 나누기 어렵다.

## 2.2 Sibling Suspense 구조

`baf5d4e`에서 도입된 구조.

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

이 구조의 의도:

- `AuthGate`만 쿠키를 읽는 dynamic hole로 둔다.
- `NoticeBanner`와 `VisibleSessionTabs`는 AuthGate와 분리해 별도 cached/prerender boundary 후보로 둔다.
- 시간표 데이터뿐 아니라, 시간표 데이터로 만든 `SessionTabs` UI 결과물도 prerender cache 후보가 된다.

대략적인 분류:

```txt
shell                         prerender 가능
AuthGate                      dynamic hole
NoticeBanner                  rendered UI prerender 후보
VisibleSessionTabs            rendered UI prerender 후보
```

장점:

- 캐시/prerender 경계가 세밀하다.
- `notice`, `timetable`이 서로 독립적인 Suspense boundary가 된다.
- dev에서 `revalidateTag("timetable")` 후 시간표 boundary 재생성이 로딩으로 보이고, 첫 화면에 fresh가 나올 수 있었다.

문제:

- 인증 실패 시에도 sibling인 `NoticeBanner`, `VisibleSessionTabs`가 병렬로 시작될 수 있다.
- `AuthGate`에서 서버 `redirect()`를 throw하면 진행 중인 RSC stream과 충돌해 dev에서 `Connection closed` 같은 오류가 날 수 있다.
- `PinRedirect`를 쓰면 redirect throw 문제는 줄지만, 인증 실패 요청에서 보호 subtree가 실행될 수 있다는 구조적 문제는 남는다.

## 2.3 AuthGate Wrapper 구조

`dcde328`에서 도입된 구조.

```tsx
<Suspense fallback={<TimetableLoading />}>
  <AuthGate>
    <NoticeBanner />
    <VisibleSessionTabs />
    <GuideLink />
  </AuthGate>
</Suspense>
```

`AuthGate`가 먼저 쿠키/PIN을 검사하고, 실패하면 children을 렌더하지 않는다.

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

대략적인 분류:

```txt
shell                         prerender 가능
AuthGate subtree              dynamic hole
  NoticeBanner                request-time render
  VisibleSessionTabs          request-time render
```

장점:

- 인증 실패 시 공지/시간표 subtree가 실행되지 않는다.
- 보호 범위가 명확하다.
- 서버 `redirect()`/RSC stream 충돌 위험을 줄일 수 있다. 현재는 `PinRedirect`로 redirect throw도 피한다.

단점:

- `NoticeBanner`, `VisibleSessionTabs`의 rendered UI 결과는 별도 prerender 조각으로 남기 어렵다.
- `revalidateTag("timetable")` 후에는 UI prerender 조각이 아니라 data cache 단위 SWR만 작동한다.

---

## 3. 구조별 캐시 동작 비교

| 구조 | 인증 위치 | 시간표 UI prerender | 시간표 data cache | 인증 실패 시 시간표 subtree |
|------|-----------|---------------------|-------------------|-----------------------------|
| proxy | route 진입 전 | 어려움 | `"use cache"` 있으면 가능 | page 진입 전 차단 |
| sibling | React tree 안, sibling | 가능 | 가능 | 실행될 수 있음 |
| wrapper | React tree 안, parent | 어려움 | 가능 | 실행 안 됨 |

중요한 차이:

```txt
sibling:
  getAllTimetableData() data cache
  + 그 데이터로 만든 SessionTabs UI prerender cache

wrapper:
  getAllTimetableData() data cache
  + 요청마다 SessionTabs 렌더
  + SessionTabs UI prerender cache는 없음
```

---

## 4. Revalidate 후 동작

## 4.1 Sibling 구조

```txt
관리자: revalidateTag("timetable", "max")
→ getAllTimetableData data cache stale
→ VisibleSessionTabs prerender 조각도 stale 후보
```

다음 요청:

```txt
prod:
  stale prerender 조각 즉시 응답
  background에서 Sheets API 호출 + 새 RSC payload 재생성
  다음 요청부터 fresh

dev:
  boundary 재생성이 요청 경로에서 더 눈에 띄게 보일 수 있음
  TimetableLoading 표시 후 fresh가 바로 보일 수 있음
```

실험에서 본 현상:

```txt
dev sibling:
  최신화 후 홈 복귀
  → 로딩 시간이 생김
  → 최신 시간표 바로 표시

prod sibling:
  최신화 후 첫 요청
  → stale 시간표 표시
  → 다음 새로고침부터 fresh
```

## 4.2 Wrapper 구조

```txt
관리자: revalidateTag("timetable", "max")
→ getAllTimetableData data cache stale
→ VisibleSessionTabs UI prerender 조각은 없음
```

다음 요청:

```txt
AuthGate 실행
→ 인증 통과
→ VisibleSessionTabs request-time render
→ getAllTimetableData() 호출
→ stale data cache 즉시 반환
→ stale 데이터로 SessionTabs 렌더
→ background에서 data cache 갱신
→ 다음 요청부터 fresh 데이터로 렌더
```

따라서 wrapper에서 첫 요청이 stale인 것은 “프리렌더 UI 조각이 stale이라서”가 아니다. 애초에 시간표 UI 조각은 prerender 대상이 아니고, dynamic render 중 stale data cache를 소비한 결과다.

---

## 5. Dev와 Prod 차이

`revalidateTag(tag, "max")`는 stale-while-revalidate 모델이다.

원칙적으로는:

```txt
첫 요청: stale 반환
background refresh
다음 요청: fresh 반환
```

prod에서는 이 원칙대로 보이는 경우가 많다.

dev에서는 prerender/재생성 작업이 요청 경로에서 더 눈에 띄게 드러날 수 있다. 그래서 sibling 구조에서는 `TimetableLoading`이 보이고 첫 화면에 fresh가 나오는 것처럼 관찰됐다.

정리:

| 환경 | sibling | wrapper |
|------|---------|---------|
| dev | prerender boundary 재생성이 로딩으로 보이고 fresh가 바로 나올 수 있음 | stale data cache를 즉시 소비하므로 첫 화면 stale |
| prod | 보통 첫 요청 stale, 다음 요청 fresh | 보통 첫 요청 stale, 다음 요청 fresh |

prod 결과에서 sibling도 첫 요청 stale로 수렴했으므로, dev의 “즉시 반영”은 dev 서버의 재생성 방식이 드러난 현상으로 보는 것이 맞다.

---

## 6. 보안/보호 범위 관점

`proxy`는 route-level auth다.

```txt
request /
→ 인증 실패 시 page 자체에 진입하지 않음
```

`AuthGate`는 subtree-level auth다.

```tsx
<PublicHeader />

<AuthGate>
  <PrivateTimetable />
</AuthGate>
```

이 구조에서는 `/` 접속 자체는 허용하고, 보호해야 하는 부분만 PIN 뒤에 둘 수 있다.

현재 시간표와 공지를 모두 보호해야 한다면 wrapper가 맞다.

```tsx
<AuthGate>
  <NoticeBanner />
  <VisibleSessionTabs />
</AuthGate>
```

공지나 안내 링크가 공개 가능하다면 분리할 수 있다.

```tsx
<NoticeBanner />
<GuideLink />

<AuthGate>
  <VisibleSessionTabs />
</AuthGate>
```

즉 AuthGate를 React tree 안으로 옮긴 진짜 장점은 캐싱만이 아니라, 보호 범위를 route 전체에서 컴포넌트 subtree 단위로 낮출 수 있다는 점이다.

---

## 7. Redirect와 RSC stream 문제

sibling 구조에서 서버 `redirect()`를 throw하면 문제가 생길 수 있다.

```tsx
<Suspense>
  <AuthGate />        // redirect() throw 가능
</Suspense>

<Suspense>
  <VisibleSessionTabs />  // 동시에 렌더 시작 가능
</Suspense>
```

인증 실패 시:

```txt
AuthGate → redirect throw
VisibleSessionTabs → 이미 getAllTimetableData() 진행 중일 수 있음
RSC stream 중단
dev에서 Connection closed 가능
```

`PinRedirect`처럼 클라이언트 이동 컴포넌트를 반환하면 redirect throw로 인한 stream 충돌은 줄일 수 있다.

하지만 sibling 구조에서는 여전히 인증 실패 요청에서도 보호 subtree가 실행될 수 있다. 그래서 보호 데이터가 중요하면 wrapper가 더 적합하다.

---

## 8. 현재 프로젝트 기준 결론

현재 프로젝트에서 우선순위는 다음과 같다.

1. 인증 실패 시 시간표/공지 subtree가 실행되지 않아야 한다.
2. Google Sheets API 호출은 학생 요청마다 반복되면 안 된다.
3. dev에서 첫 새로고침에 fresh처럼 보이는 prerender-level SWR은 필수 요구사항이 아니다.

따라서 정식 구조는 wrapper가 더 적합하다.

```txt
AuthGate wrapper:
  보안 흐름 명확
  보호 subtree 실행 차단
  Google Sheets API는 "use cache"로 보호
  시간표 UI prerender 조각은 포기
```

sibling 구조는 캐시/prerender 실험에는 유용하다.

```txt
sibling:
  prerender boundary 차이를 관찰하기 좋음
  dev에서 로딩 후 fresh 현상 확인 가능
  하지만 보호 subtree가 AuthGate와 독립 실행될 수 있음
```

proxy 구조는 route-level 인증에는 명확하지만, React tree 안에서 공개/보호 영역을 나누는 이점이 없다.

```txt
proxy:
  / 전체를 인증 뒤에 둠
  page 내부에서 public/private 경계를 설계하기 어려움
  use cache가 없으면 외부 API 매 요청 호출
```

최종 한 줄:

> sibling은 UI prerender 조각까지 살릴 수 있는 캐시 실험 구조이고, wrapper는 보호 subtree 실행을 보장하는 운영 구조다. 현재 프로젝트에서는 wrapper + data cache가 더 맞다.
