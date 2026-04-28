# 모드와 Prerender 범위

`layers.md`가 현재 프로젝트의 캐시 구조, `behaviors.md`가 시나리오별 동작이라면, 이 문서는 **"왜 이런 구조를 골랐나"**의 배경 — Cache Components 모드 차이, prerender에 데이터가 들어가는 조건, 그리고 `"use cache"`를 제거하면 동작이 어떻게 바뀌는지 — 를 정리한다.

---

## 1. `cacheComponents` — 캐시의 디폴트 방향 스위치

이 옵션은 단순한 기능 토글이 아니라 **App Router의 캐싱 모델 자체를 뒤집는** 스위치다.

| 측면 | `false` (legacy) | `true` (Cache Components) |
|------|------------------|--------------------------|
| 기본값 | 정적 (static) | 동적 (dynamic) |
| Opt-in 방향 | dynamic 옵트인 (`cookies()`, `dynamic = 'force-dynamic'`) | cache 옵트인 (`"use cache"`) |
| 캐시 단위 | 라우트 전체 | 함수/컴포넌트 단위 |
| `fetch()` | **자동 캐시** (no-store로 옵트아웃) | 자동 캐시 안 됨, `"use cache"` 필요 |
| non-fetch async (SDK) | `unstable_cache()`로 감싸야 캐시 | `"use cache"` 디렉티브 |
| `cookies()`/`headers()` 영향 | **라우트 전체를 dynamic화** | 해당 hole만 dynamic |
| 부분 prerender | ❌ (전부 정적 OR 전부 동적) | ✅ shell + hole |

### legacy 모델의 라우트 단위 동작

```ts
// 옛날 패턴
export const revalidate = 60          // 60초 ISR
export const dynamic = 'force-dynamic' // 라우트 전체 동적화
```

`cookies()` 한 번 호출하면 페이지 전체가 dynamic이 되어 build-time prerender가 사라진다. 그래서 학생 페이지처럼 인증 쿠키 + 정적 콘텐츠를 섞고 싶으면 **인증을 미들웨어로 분리**해서 페이지를 정적으로 유지하는 패턴이 흔했다.

이 프로젝트도 과거에 미들웨어 패턴을 썼다가 캐싱이 깨지는 이슈로 갈아엎었다. 자세한 건 `notes/problem-solving/middleware-caching-issue.md`.

### 자세한 비교

`notes/learning/cache-components-on-off.md`에 빌드 산출물·DX 차이까지 더 자세히 정리되어 있다.

---

## 2. Prerender에 데이터까지 들어가는 조건

### Prerender 정의

빌드/캐시 시점에 컴포넌트를 실행해서 결과 RSC payload를 저장하는 것. **저장된 RSC payload는 props에 데이터가 직렬화돼 들어있다.**

```tsx
// 빌드 시점 prerender 결과 예시
<SessionTabs sessions={[
  { week: 0, ... },  // ← 실제 데이터가 props로 baked in
  { week: 1, ... },
  ...
]} />
```

### 데이터가 prerender에 들어가는 원리

prerender 시점에 그 데이터를 fetch하는 코드가 **실행 가능**해야 한다. 즉:
- **캐시 가능한 데이터**여야 함 — 한 번 fetch해서 prerender에 baked in
- **동적 데이터**(cookies, uncached fetch)는 prerender 시점에 fetch 불가 → 안 들어감

### 모드별 조건

| 모드 | `fetch()` | non-fetch async (SDK 등) |
|------|-----------|------------------------|
| `false` legacy | 기본 캐시 → **자동으로 prerender에 데이터 포함** | `unstable_cache()` 안 쓰면 매 요청 → 라우트 dynamic화 → prerender 자체가 사라짐 |
| `true` CC | 기본 캐시 안 됨 → prerender 안 들어감 | `"use cache"` 안 쓰면 매 요청 → 그 hole만 dynamic |

### 정리

- **legacy + `fetch()`**: 별도 설정 없이 데이터까지 prerender에 자동 포함
- **legacy + SDK**: `unstable_cache()` 명시해야 포함
- **CC + 무엇이든**: `"use cache"` 명시해야 포함

→ "prerender가 기본적으로 데이터까지 캐싱"은 **legacy의 fetch만 해당하는 특수 케이스**. CC 모델에선 명시(`"use cache"`)가 필요하다.

### 두 캐시 레이어로 분리되어 저장

`"use cache"` 함수가 prerender에 포함될 때 **두 군데에 저장된다**:

1. **Data Cache**: 함수의 raw 반환값 (`TimetableData[]` 배열)
2. **Full Route Cache**: 그 데이터를 사용해 그린 RSC payload (props 직렬화)

`revalidateTag("timetable")` 한 번이 둘 다 stale 마킹한다. 자세한 건 `layers.md` §4.

---

## 3. 이 프로젝트가 CC를 켠 결정적 이유

`googleapis` SDK는 `fetch`가 아니라서 legacy의 자동 fetch 캐싱 혜택을 받지 못한다.

legacy로 가려면:
- `unstable_cache(getAllTimetableData, ...)`로 감싸기
- + `cookies()`를 미들웨어로 분리해서 페이지를 정적으로 유지
- + 미들웨어 캐싱 이슈 회피 패턴 적용

CC 모델은 `"use cache"` 한 줄 + Suspense 경계만 두면 끝나고 `cookies()`도 같은 페이지에 자연스럽게 둘 수 있다. 더 단순하다.

---

## 4. 실험: `"use cache"` 제거 시 동작

`getAllTimetableData()`에서 `"use cache"`와 `cacheTag("timetable")`를 제거했을 때 무엇이 바뀌는지.

### 변경 사항

```ts
// Before
export async function getAllTimetableData(): Promise<TimetableData[]> {
  "use cache"
  cacheTag("timetable")
  const spreadsheet = await fetchTimetableData()
  return extractFirstTabSessions(spreadsheet)
}

// After (실험용)
export async function getAllTimetableData(): Promise<TimetableData[]> {
  const spreadsheet = await fetchTimetableData()
  return extractFirstTabSessions(spreadsheet)
}
```

`cacheTag` import도 같이 빠진다 (lint 깨짐 방지).

### 빌드 산출물 변화

- 이전: `/` 라우트가 Partial Prerender (shell + cached holes)
- 이후: `/` 라우트의 시간표 hole이 dynamic으로 바뀜 → build 로그에서 라우트 표시가 달라짐

prerender에는 **시간표 자리에 데이터 없이 fallback HTML(스피너)만** 들어가고, 실제 SessionTabs 출력은 매 요청 동적 생성.

### 동작 변화

| 측면 | `"use cache"` 있음 | 제거 후 |
|------|--------------------|---------|
| 빌드 시 prerender | shell + cached holes (데이터 baked in) | shell만 (시간표 자리는 fallback) |
| 새로고침 시 Sheets 호출 | 0회 (fresh일 때) | **매번 1회** |
| 시간표 스피너 | 거의 안 보임 (캐시 hit) | **매번 보임** (Sheets 왕복 동안) |
| `revalidateTag("timetable")` | stale 마킹 → 백그라운드 재생성 | **no-op** (무효화할 캐시 없음) |
| 콘솔 "prerendering..." | revalidate 후에 뜸 | 안 뜸 |
| Router Cache (뒤로가기) | hit | hit (브라우저 메모리는 별개라 영향 없음) |

### `/api/revalidate`의 변화

`revalidateTag("timetable", "max")` 호출은 그대로 살아있지만, **`timetable` 태그가 어디에도 안 붙어 있으니 no-op**이 된다. 에러는 안 나고 그냥 무효화할 대상이 없는 호출.

`notice` 쪽은 영향 없음 — `lib/notice.ts`의 `"use cache"` + `cacheTag("notice")`은 그대로라 공지 기능은 정상 작동.

### 어드민 "시간표 최신화" 버튼의 의미 변화

| 모델 | 매니저 시트 수정 → 학생 반영 시점 | 최신화 버튼의 역할 |
|------|------------------------------|------------------|
| `"use cache"` 있음 | 관리자가 최신화 클릭 후 다음 요청부터 | 캐시 무효화 트리거 — **명시적 반영 통제** |
| 제거 후 | **즉시 (다음 학생 요청부터)** | no-op — 의미 없음 |

→ 시트 수정이 학생에게 즉시 반영되는 건 "쉬워졌지만", 그건 **모든 학생 요청이 통제 없이 시트를 직접 hit하는 것**과 같다.

### 트레이드오프

| 측면 | `"use cache"` 유지 (현재) | 제거 |
|------|------------------------|------|
| 시트 수정 → 학생 반영 시점 | 관리자 최신화 클릭 후 | 즉시 |
| Sheets API 호출량 | 무효화당 1회 | 학생 새로고침마다 1회 |
| 사용자 체감 속도 | 빠름 (캐시 hit) | 느림 (매번 Sheets 왕복) |
| 관리자 워크플로 | "수정 → 최신화 클릭" 2단계 | "수정"만 (자동 반영) |
| Sheets API quota 위험 | 낮음 | **높음** (학생 N명 동시 새로고침 시 N회 호출) |

Sheets API는 분당 호출 제한이 있고 학생들이 수업 시간 직전에 동시 접속하는 패턴이 있어서, 캐시 없이 운영하면 **quota 폭발 + 응답 지연** 위험이 크다. 그래서 `"use cache"` 유지가 정답.

---

## 한 줄 요약

> `cacheComponents`는 캐시의 디폴트 방향(라우트 정적 vs 컴포넌트 동적)을 뒤집는 스위치. prerender에 데이터까지 들어가려면 그 데이터의 fetch가 캐시 가능해야 하고, CC 모델에선 `"use cache"`가 필수 명시다. 빼면 매 요청 fresh fetch가 되어 응답이 느려지고 외부 API quota 위험이 커진다.
