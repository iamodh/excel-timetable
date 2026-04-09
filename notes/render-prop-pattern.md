# Render Prop 패턴

## React children의 두 가지 쓰임

### 1. 일반 children — JSX를 넘김

```tsx
<Card>
  <p>안녕</p>     // children = JSX 엘리먼트
</Card>

function Card({ children }) {
  return <div>{children}</div>   // 그대로 렌더링
}
```

태그 사이에 넣은 JSX가 `children` prop으로 전달되고, 부모가 그대로 렌더링한다.

### 2. Render Prop — 함수를 넘김

```tsx
<SessionTabs>
  {(data) => <Header data={data} />}   // children = 함수
</SessionTabs>

function SessionTabs({ children }) {
  const [current, setCurrent] = useState(0)
  return children(sessions[current])    // 함수를 호출해서 렌더링
}
```

`children`에 함수를 넘기면, 부모 컴포넌트가 인자를 넣어 호출할 수 있다.
일반 children 사용법과 이름만 같을 뿐, 별도의 패턴이다.

## 왜 Render Prop을 쓰는가

Next.js App Router에서 서버/클라이언트 컴포넌트 간 역할 분리(SoC)를 위해 사용한다.

### 문제

- `page.tsx`(서버 컴포넌트)에서 데이터를 가져온다
- 어떤 회차를 보여줄지는 `useState`가 필요한데, 서버 컴포넌트에서 사용 불가
- 상태 관리를 클라이언트 컴포넌트로 분리해야 한다

### Render Prop으로 해결

```tsx
// page.tsx (서버 컴포넌트) — 함수 몸체 정의
<SessionTabs sessions={sessions}>
  {(data) => (
    <TimetableHeader data={data} />
    <WeekGrid ... />
  )}
</SessionTabs>

// SessionTabs.tsx (클라이언트 컴포넌트) — 상태 관리 + 함수 호출
function SessionTabs({ sessions, children }) {
  const [current, setCurrent] = useState(0)
  return (
    <>
      <nav>탭 버튼들...</nav>
      {children(sessions[current])}
    </>
  )
}
```

| 역할 | 담당 |
|------|------|
| 데이터 페칭 | 서버 컴포넌트 (page.tsx) |
| "데이터를 받으면 이렇게 그려라" (렌더링 방법 정의) | 서버 컴포넌트 (page.tsx) |
| "지금 선택된 데이터는 이거다" (상태 관리 + 함수 호출) | 클라이언트 컴포넌트 (SessionTabs) |

### 대안: 클라이언트 컴포넌트에 전부 넣기

```tsx
// page.tsx (서버)
<TimetableView sessions={sessions} />

// TimetableView.tsx ("use client") — 상태 + 렌더링 전부
```

Render prop 없이 더 직관적이지만, 클라이언트 컴포넌트가 커진다.
프로젝트 규모가 작으면 이 방식이 더 읽기 쉬울 수 있다.
