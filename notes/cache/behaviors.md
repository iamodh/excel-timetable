# 캐시 동작 시나리오

`layers.md`가 캐시 레이어의 정적 구조를 정리했다면, 이 문서는 **사용자 행동·관리자 액션이 일어났을 때 각 레이어에서 무슨 일이 벌어지는지**를 시나리오별로 정리한다.

---

## 0. 등장하는 캐시 레이어 빠른 참조

| 레이어 | 위치 | 무엇을 저장 | 무효화 트리거 |
|--------|------|------------|--------------|
| Data Cache | 서버 | `"use cache"` 함수 반환값 (raw) | `revalidateTag(tag)` |
| Full Route Cache | 서버 | 페이지 prerender (HTML + RSC payload, 데이터 직렬화 포함) | 소비한 데이터 캐시 태그 폐기 시 자동 |
| Router Cache | 브라우저 메모리 | `<Link>`로 방문한 라우트의 RSC payload | 새로고침, 일정 시간 경과, `router.refresh()` |

자세한 구조는 `layers.md` §2, §4, §6 참조.

---

## 1. 새로고침 (F5 / Cmd+R)

### 캐시 fresh 상태 (관리자 액션 없음)

```
브라우저: 새 HTTP 요청 발사
  ↓
서버:
  shell HTML            → Full Route Cache HIT  (즉시)
  NoticeBanner RSC      → Full Route Cache HIT  (Redis 호출 0회)
  VisibleSessionTabs RSC→ Full Route Cache HIT  (Sheets 호출 0회)
  AuthGate              → MISS — cookies + Redis 1회 (PIN 조회)
  ↓
브라우저: shell + 캐시된 두 hole 즉시 그림 + AuthGate stream 도착하면 채움
```

**외부 호출**: AuthGate의 Redis 1회만.
**스피너**: 안 보임 (모든 hole이 즉시 resolve).

### Router Cache 관점

새로고침은 브라우저 메모리의 Router Cache를 **폐기**한다. 그래서 클라이언트 캐시 효과는 없고, 위 표는 전부 서버 캐시 레이어의 동작이다.

### 사용자 체감

브라우저 탭에 잠깐 로딩 인디케이터가 뜨고 (HTTP 왕복), 응답 도착 즉시 페이지 그려짐. Suspense fallback(시간표 스피너)은 보이지 않거나 깜빡 수준.

---

## 2. 뒤로가기 / 앞으로가기

```
사용자: /guide → 뒤로가기 → /
  ↓
브라우저: Router Cache에서 / 의 RSC payload 찾음
  ↓
HIT: 즉시 복원 — 서버 요청 없음
```

**외부 호출**: 0회 (서버에 요청도 안 감).
**스피너**: 안 보임.

### 주의

Router Cache는 in-memory + 일정 staleTimes 후 만료. Next 16 default는 dynamic 페이지 0초, static 5분 정도. 기본값에 의존하므로 새로고침이나 충분한 시간 경과 후엔 다시 서버 왕복.

---

## 3. 클라이언트 네비게이션 (`<Link>`로 이동)

```
사용자: / → /guide 또는 / 사이 <Link> 클릭
  ↓
브라우저: 대상 라우트가 Router Cache에 있는지 확인
  ├─ HIT  → 즉시 복원 (서버 요청 없음)
  └─ MISS → 서버에 RSC 요청
              ↓
            서버: Full Route Cache + dynamic hole 합성 → RSC stream
```

이 프로젝트엔 학생 페이지(`/`)와 가이드(`/guide`) 정도만 있어서 Router Cache 효과가 크진 않다.

---

## 4. 시간표 최신화 (관리자 → `/api/revalidate`)

### 호출 직후 일어나는 일

```
관리자: /admin에서 "시간표 최신화" 클릭
  ↓
POST /api/revalidate
  ↓
revalidateTag("timetable", "max")
  ↓
서버 측 즉시 변화:
  - Data Cache의 "timetable" 태그 entry → stale 마킹 (값 그대로)
  - Full Route Cache의 / prerender → stale 마킹 (값 그대로)
  ↓
응답: 200 "시간표가 최신화되었습니다."
```

이 시점엔 **아직 Sheets API는 호출 안 됨**. 단지 stale 표시만.

### 다음 학생 요청 (첫 번째 요청자)

```
학생: 새로고침
  ↓
서버:
  Full Route Cache의 / 가 stale
    ├─ 응답 경로: stale 값을 즉시 반환 (구 시간표)
    └─ 백그라운드: prerender 재생성 시작
                    ↓
                  Sheets API 호출
                    ↓
                  새 데이터로 RSC 재생성
                    ↓
                  Data Cache + Full Route Cache 교체 → fresh
  ↓
학생 화면: 구 시간표 즉시 표시. 스피너 안 뜸.
```

콘솔의 **"prerendering..." 로그가 이 백그라운드 재생성**.

### 두 번째 학생 요청부터

백그라운드 prerender가 끝났다면 fresh 값. 안 끝났다면 또 stale 응답 + 다시 백그라운드... (이론상 같은 작업이 중복 트리거되진 않음, 진행 중인 prerender 결과를 공유)

### 외부 호출 카운트

- 관리자 액션: Sheets 0회
- 첫 번째 학생 요청: stale 응답 + 백그라운드에서 Sheets 1회
- 그 후 학생 요청들: 0회 (fresh 캐시 hit)

→ 학생 N명이 새로고침해도 Sheets 호출은 **1회**.

자세한 SWR 사이클은 `notes/learning/stale-while-revalidate.md` 참조.

---

## 5. 시간표 로딩 스피너가 언제 보이는가

`app/page.tsx:65`의 `<Suspense fallback={<TimetableLoading />}>` 가 `getAllTimetableData()`의 resolve를 기다릴 때만 fallback이 그려진다.

### 보이는 케이스

| 상황 | 이유 |
|------|------|
| 콜드 부팅 후 첫 요청 | 캐시 entry가 아예 없음 → 동기 fetch → Sheets API 왕복(0.5~2s) 동안 스피너 |
| 캐시 expire 도달 후 첫 요청 | `"max"` 프로파일이라 거의 안 일어남 (default expire 매우 김). 이론적 케이스 |
| 클라이언트 네비게이션이 Router Cache 미스 | 대상 페이지의 cached hole이 아직 클라이언트에 없으면 fallback 잠깐 |
| 캐시 hit이지만 hole RSC stream이 늦게 도착 | 빠른 네트워크에선 깜빡, 느린 모바일에선 수백 ms |

### 안 보이는 케이스

| 상황 | 이유 |
|------|------|
| 일반 새로고침 (캐시 fresh) | hole이 Full Route Cache에서 즉시 resolve |
| 시간표 최신화 직후 새로고침 | **stale 값이 즉시 응답** → Suspense suspend 안 함 (SWR 동작) |
| 뒤로가기 / 앞으로가기 | Router Cache hit, 서버 요청 자체가 없음 |
| AuthGate가 redirect | 페이지가 그려지지 않으니 스피너도 안 보임 |

### 자주 헷갈리는 포인트

#### "최신화 누르면 스피너 떠야 하는 거 아님?"
아님. `"max"` 프로파일이 stale-while-revalidate라서 무효화 직후 첫 요청자도 **stale 즉시 응답** 받는다. 캐시가 폐기되는 게 아니라 stale 마킹만. → Suspense suspend 안 함 → 스피너 안 뜸.

스피너를 보고 싶다면 캐시 entry 자체가 없어야 한다 (`rm -rf .next && npm run dev` 후 첫 접속).

#### "전체 페이지가 로딩되는 것처럼 보이는데?"
거의 확실하게 **브라우저의 HTTP 왕복 인디케이터** (탭 스피너). Suspense fallback은 페이지 안에 그려지는 UI고, 이건 브라우저 chrome의 로딩 표시. 둘은 다른 레이어다.

#### "콘솔에 'prerendering...'이 뜨는데 페이지는 빠른데?"
정상. 사용자 응답은 stale 값으로 즉시 가고, "prerendering..."은 **별개의 백그라운드 작업**. 응답 경로와 무관.

### 한 줄 요약

> 시간표 스피너는 **캐시 entry가 아예 없을 때만** 의미 있게 보인다. SWR(`"max"`)로 돌고 있어서 정상 운영 중엔 거의 안 떠야 정상.

---

## 6. dev vs prod 차이

| 항목 | dev (`npm run dev`) | prod (`npm run build && npm start`) |
|------|--------------------|--------------------------------------|
| 첫 페이지 컴파일 | 요청마다 즉석 컴파일 (느림) | 미리 빌드된 파일 |
| Full Route Cache | 변동 가능, dev 서버가 종종 무효화 | 빌드 산출물 + on-demand |
| "prerendering..." 로그 | dev 서버의 즉석 prerender (블로킹 가능) | 백그라운드 SWR (블로킹 안 함) |
| 새로고침 체감 속도 | 느릴 수 있음 | 빠름 |

→ **캐시 동작을 정확히 보려면 prod 빌드에서 확인**. dev에서 본 "전체 페이지 로딩"은 dev 서버 특성일 가능성이 높다.

```bash
npm run build && npm run start
# http://localhost:3000 에서 시나리오 재현
```

---

## 7. 시나리오 결합 — 한 학생의 전형적 세션

```
1. /pin 접속 → PIN 입력 → /로 redirect
   - AuthGate가 cookie 확인 → 통과 → SessionTabs 그림
   - 콜드 부팅이면 Sheets 호출 1회, 이후 학생들은 캐시 hit

2. 시간표 보다가 가이드 클릭 (<Link href="/guide">)
   - Router Cache에 /guide 없으면 서버 RSC fetch
   - /guide는 정적 페이지라 빠름

3. 뒤로가기로 / 복귀
   - Router Cache에 / 있음 → 즉시 복원, 서버 요청 0회

4. 30분 뒤 다시 새로고침
   - Router Cache 폐기, 서버에 새 요청
   - 캐시 fresh면 Sheets/Redis(notice) 0회, AuthGate Redis 1회만

5. (그 사이 관리자가 시트 수정 + 최신화 클릭)
   - 다음 새로고침이 stale 값 받음, 백그라운드 prerender 트리거
   - 학생은 스피너 없이 구 시간표 보고, 그 다음 새로고침부터 새 시간표
```
