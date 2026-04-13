# Next.js App Router 파일 컨벤션

`app/` 아래의 **폴더 구조가 경로를 만들고, 파일 이름이 역할을 결정한다**. 이 두 축만 이해하면 App Router 라우팅의 90%가 끝난다.

---

## 1. 두 축: 경로와 역할

### 폴더 = 경로

```
app/
├─ page.tsx              → /
├─ pin/
│  └─ page.tsx           → /pin
├─ admin/
│  ├─ page.tsx           → /admin
│  └─ layout.tsx         → /admin/* 공통 레이아웃
└─ api/
   └─ auth/
      └─ pin/
         └─ route.ts     → /api/auth/pin
```

### 파일명 = 역할

| 파일명 | 역할 | Next.js가 인식하는 방식 |
|--------|------|----------------------|
| `page.tsx` | 라우트의 UI | **default export** |
| `layout.tsx` | 공통 레이아웃 (자식 라우트에 props.children) | **default export** |
| `loading.tsx` | Suspense fallback | **default export** |
| `error.tsx` | 에러 바운더리 | **default export** (`"use client"` 필수) |
| `not-found.tsx` | 404 페이지 | **default export** |
| `route.ts` | API 핸들러 | **named export** (GET/POST/PUT/...) |

---

## 2. default export vs named export — 왜 다른가

이게 처음 보면 헷갈린다. `page.tsx`의 함수는 왜 관례상 `Page`라 쓰고, `route.ts`는 왜 꼭 `POST`라 써야 하나?

### `page.tsx`의 `Page` — 이름은 관례, default export가 규칙

```tsx
// app/page.tsx
export default async function Page() { ... }
```

- Next.js가 보는 건 **default export**. 함수 이름은 **아무거나 상관없음**.
- `export default async function Hello()` 도 되고 `export default async function 시간표페이지()` 도 돈다.
- 관례상 `Page`라 쓰는 이유: 스택 트레이스 / React DevTools에 이름이 뜰 때 가독성 좋아서. 익명 함수(`export default async () => ...`)도 동작하지만 디버깅 때 불친절.

### `route.ts`의 `GET`/`POST` — 이름 자체가 규칙

```ts
// app/api/foo/route.ts
export async function POST(req: Request) { ... }
```

- Next.js가 보는 건 **export 이름**. `POST`라는 이름이어야 POST 요청에 매칭됨.
- `export async function post()` 는 동작하지 않음 (대문자 정확히 필요).
- default export는 무시됨.

### 요약 표

| | `page.tsx` | `route.ts` |
|---|---|---|
| Next.js가 인식하는 것 | **위치** (default export) | **이름** (GET/POST/PUT/...) |
| 함수 이름 자유도 | 자유 | 고정 (HTTP 메서드명과 일치) |
| 관례 `Page`의 의미 | 가독성용 | — |

**"컨벤션"의 층위가 다르다.** `Page`는 "그냥 다들 그렇게 쓰는 이름"이고, `POST`는 "이 이름이어야만 작동하는 규칙".

---

## 3. 특수 폴더 표기

경로 매핑에 영향을 주는 폴더 표기 두 가지.

| 표기 | 의미 | 예시 |
|------|------|------|
| `(group)` | 경로에 **포함 안 됨** (논리적 그룹핑용) | `app/(auth)/login/page.tsx` → `/login` |
| `[id]` | 동적 세그먼트 | `app/posts/[id]/page.tsx` → `/posts/1`, `/posts/2` |
| `[...slug]` | catch-all | `/docs/a/b/c` 전체가 `slug` 배열로 |
| `[[...slug]]` | optional catch-all | 빈 경로도 매칭 |
| `_private` | 라우팅 무시 (언더바 prefix) | 내부 헬퍼 두는 용도 |

---

## 4. `app/` 밖의 특수 파일

루트(프로젝트 최상단)에 두는 **단일 파일**들은 App Router 파일 컨벤션과 별개다.

| 파일 | 역할 |
|------|------|
| `proxy.ts` (구 `middleware.ts`) | 모든 요청 앞에서 실행되는 프록시 (프로젝트에 **1개만** 존재) |
| `next.config.ts` | Next.js 설정 |
| `instrumentation.ts` | 서버 시작 시 1회 실행 (옵저버빌리티 초기화 등) |

`cookies.md §8`에서 정리한 대로, `proxy.ts`는 Express middleware와 혼동을 피하려 Next.js 16에서 이름이 바뀐 것. "모든 요청 앞의 프록시" 역할이라 `app/` 내부 파일 컨벤션과 다른 층위에 있다.

---

## 5. 이 프로젝트의 실제 매핑

```
app/
├─ page.tsx                    → /          (시간표)
├─ pin/
│  └─ page.tsx                 → /pin       (PIN 입력)
├─ admin/
│  └─ page.tsx                 → /admin     (관리자)
└─ api/
   ├─ auth/
   │  └─ pin/
   │     └─ route.ts           → /api/auth/pin (POST: PIN 검증)
   └─ revalidate/
      └─ route.ts              → /api/revalidate (POST: 시간표 최신화)

proxy.ts                       → 모든 요청 가로채기 (인증 가드)
```

---

## 6. 자주 헷갈리는 포인트

### "`page.tsx`의 함수 이름을 바꾸면 페이지가 안 뜬다?"

아니다. **default export만 지키면** 이름은 뭐든 동작한다. 이름을 바꿔서 안 되는 경우는 대부분 오타나 default를 빠뜨렸을 때.

### "`route.ts`에 default export도 같이 쓰면?"

무시된다. Next.js는 `GET`, `POST` 등 **named export**만 본다. default export 해봤자 호출되지 않음.

### "같은 폴더에 `page.tsx`와 `route.ts` 둘 다 두면?"

**불가능하다.** 같은 경로를 두 개가 가져가려 해서 빌드 에러. 경로당 하나만 선택.

### "`layout.tsx`는 자식이 바뀌어도 재렌더링 안 된다?"

맞다. `layout`은 자식 라우트 전환 시 **유지**되는 게 목적이다. 로그인 상태나 사이드바처럼 경로 바뀌어도 안 없어져야 할 UI를 여기 둔다. 매번 새로 그리고 싶으면 `template.tsx`를 쓴다.

---

## 7. 참고

- Next.js 공식 파일 컨벤션: https://nextjs.org/docs/app/api-reference/file-conventions
- App Router 라우팅 개요: https://nextjs.org/docs/app/building-your-application/routing
