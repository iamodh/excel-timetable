# Redis, Upstash, Supabase 정리

M11(PIN 접근 제어)부터 "관리자가 바꿀 수 있고 재배포해도 살아남는 값"을 저장해야 해서 KV 스토리지를 도입하면서 정리한 개념 노트.

---

## 1. Redis — 인메모리 KV 데이터베이스

### 정체

오픈소스 **인메모리 key-value 데이터베이스**. 직접 서버에 설치해서 돌리는 소프트웨어다. Mac에선 `brew install redis`로 설치 가능.

### "인메모리"의 정확한 의미

"사용자 브라우저 RAM"도 "앱 서버 RAM"도 아닌, **Redis 프로세스 자신의 RAM**에 데이터를 상주시킨다는 뜻.

```
[학생 스마트폰]      [Next.js 서버]        [Redis 서버]
  브라우저    ───>    PIN 조회 요청  ───>   RAM에 PIN 상주 ← 여기!
                                            └─ dump.rdb (디스크 백업)
```

| DB 종류 | 데이터 상주 위치 |
|---------|------------------|
| Postgres/MySQL | DB 서버의 **디스크**, 필요할 때만 RAM으로 |
| **Redis** | DB 서버의 **RAM**, 평상시에도 통째로 |

### KV 형태

```
┌─────────────────────────────────┐
│ student_pin     → "1234"        │  ← 해시 테이블로 보관
│ admin_notice    → "PIN 변경됨"    │  ← 조회 O(1)
│ session:abc123  → "user=홍길동"   │
└─────────────────────────────────┘
```

key로 찾으면 데이터가 아무리 많아도 즉시 찾는다. 문자열 외에 List, Set, Hash, Sorted Set 자료구조도 지원.

### 속도가 빠른 이유

복제본이나 persistence 때문이 아니라 **읽기 경로 자체가 RAM**이기 때문.

| 매체 | 1회 읽기 대략 시간 |
|------|-------------------|
| RAM | ~100ns |
| SSD | ~100μs (RAM보다 1,000배 느림) |
| HDD | ~10ms (RAM보다 100,000배 느림) |

여기에 단순 자료구조(O(1) 해시) + 단일 스레드(락 없음) + 가벼운 프로토콜이 더해져 밀리초 이하 응답이 나온다.

### "인메모리인데 안 날아가?"

날아가지 않는다. 두 가지 안전장치가 있다.

**① Persistence (디스크 저장)** — 프로세스 재시작 복구용
- **RDB 스냅샷**: N분마다 전체 데이터를 디스크 덤프
- **AOF (Append-Only File)**: 쓰기 명령을 로그로 축적
- 서버가 꺼졌다 켜지면 디스크에서 다시 읽어 RAM으로 올림

**② Replication (복제본 서버)** — 서버 장애 복구용
- Primary의 데이터를 다른 AZ의 Replica 서버로 실시간 복제
- Primary 죽으면 Replica가 자동 승격

둘 다 **안전/가용성**을 위한 장치지 속도 목적이 아니다.

### 언제 쓰나 / 언제 안 쓰나

| 쓰기 좋은 경우 | 안 맞는 경우 |
|---------------|-------------|
| 캐시 (DB 앞단) | 관계형 데이터 (조인, 외래키) |
| 세션 스토어 | 대용량 파일 (이미지, 동영상) |
| 카운터 (조회수, rate limit) | 복잡한 SQL 쿼리 |
| **이 프로젝트의 PIN/공지** | |

---

## 2. 로컬 Redis vs 클라우드 Redis

내 맥북에 `brew install redis`로 설치할 수 있다. 그런데 왜 Upstash 같은 클라우드를 쓸까?

### 핵심: 배포 환경은 내 컴퓨터가 아니다

| 환경 | 실행 위치 | 로컬 Redis로 충분? |
|------|----------|-------------------|
| `npm run dev` | 내 맥북 | ✅ `localhost:6379` 바로 접근 |
| `npm test` | 내 맥북 | ✅ |
| **Vercel 배포본** | AWS의 어느 데이터센터 | ❌ 내 맥북의 localhost에 도달 불가 |

Vercel에서 돌아가는 배포본은 내 맥북과 물리적으로 다른 곳에 있어서 `localhost:6379`를 아무리 불러도 도달하지 못한다. 내 맥북이 꺼져 있으면 더 확실히 안 된다.

### 그래서 프로덕션용 Redis는 "인터넷에서 24/7 돌아가는 곳"에 있어야 한다

선택지:
1. **직접 클라우드 서버 빌려서 Redis 설치** — EC2 빌려서 Linux 깔고, Redis 설치, 방화벽, 인증, 모니터링, 백업, 장애 복구, 업그레이드... 가능하지만 부업이 하나 생긴다.
2. **매니지드 서비스 (Upstash 등)** — 위 작업을 다 대신해주고 월 요금(또는 무료 티어) 수령.

대부분 프로젝트가 **"로컬 개발 = brew로 설치한 Redis, 프로덕션 = 매니지드 서비스"** 조합을 쓴다. 둘 다 Redis라 코드는 똑같고 접속 URL만 다르다.

---

## 3. Upstash — Redis 매니지드 서비스

### 정체

**Redis를 매니지드로 제공하는 클라우드 회사 (DBaaS).** AWS/GCP 위에 Redis 프로세스를 띄워주고 관리해준다.

직접 운영 vs Upstash:

```
[직접 운영]                      [Upstash]
1. 서버 빌리기                    1. upstash.com 가입
2. Linux + Redis 설치             2. Create Database 클릭
3. 설정 파일 튜닝                  3. 발급된 URL + Token을 env에 붙여넣기
4. 방화벽, 인증                    끝.
5. 모니터링 설치
6. 백업 스케줄
7. 장애 복구, 업그레이드
8. 클러스터 구성
```

같은 "매니지드" 패턴의 다른 예:

| 오픈소스 소프트웨어 | 매니지드 서비스 |
|--------------------|----------------|
| PostgreSQL | AWS RDS, Supabase, Neon |
| Redis | **Upstash**, AWS ElastiCache |
| MongoDB | MongoDB Atlas |

### Upstash가 일반 Redis 호스팅과 다른 점

Upstash는 **HTTP/REST 엔드포인트**를 제공한다. 일반 Redis는 TCP 소켓으로 통신하는데, Upstash는 stateless HTTP로 접근할 수 있다.

왜 중요한가:
- **서버리스/Edge Runtime과 호환**: Vercel Functions·Next.js proxy는 요청마다 새 인스턴스가 뜨고 persistent TCP를 유지할 수 없음 → 일반 Redis 클라이언트로 접근 불가. HTTP면 가능.
- **콜드 스타트 비용 없음**: 연결 맺는 오버헤드 없이 요청 한 번으로 끝.
- **요청당 과금**: 상시 구동 인스턴스 비용이 아니라 HTTP 요청 수 기준 → 트래픽 적은 프로젝트에 유리.

### 무료 티어

- 10,000 commands/day
- 256MB 저장소
- 이 프로젝트(PIN + 공지)는 하루 수백 요청 수준 → 충분

### Vercel KV와의 관계

- 원래 Vercel이 "Vercel KV" 브랜드로 KV 서비스를 팔았음
- 내부 구현이 사실 **Upstash Redis**였음
- 2024년 말 Vercel이 Storage를 Marketplace 모델로 전환 → Vercel KV 브랜드 종료
- 지금은 Vercel Marketplace에서 Upstash를 직접 연결
- 기존 `@vercel/kv` 패키지는 **deprecated**, `@upstash/redis`로 이관 안내

"Vercel에서 KV 쓴다" = 실질적으로 "Upstash Redis 쓴다"와 같다.

---

## 4. @upstash/redis — npm 클라이언트 패키지

### 정체

Upstash Redis 서버(또는 호환 엔드포인트)에 **HTTP로 접속하는 Node.js/TypeScript SDK**.

### 일반 Redis 클라이언트와의 차이

| 항목 | 일반 `redis`/`ioredis` | `@upstash/redis` |
|------|-----------------------|------------------|
| 통신 프로토콜 | TCP | HTTPS REST (fetch 기반) |
| Persistent connection | 필요 | 불필요 (stateless) |
| Edge Runtime 지원 | ❌ | ✅ |
| 용도 | 상시 구동 서버 | 서버리스, Edge |

### 사용 예

```typescript
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()
// 자동으로 UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN 환경변수 읽음

await redis.set("student_pin", "1234")
const pin = await redis.get<string>("student_pin")
```

### 이 프로젝트에서 쓰는 이유

1. **M11 `proxy.ts`의 PIN 조회**: Next.js proxy는 Edge Runtime이라 TCP 기반 Redis 클라이언트 사용 불가 → HTTP 기반이어야 함.
2. **M13 PIN 변경 / 공지 CRUD**: 관리자가 런타임에 값을 바꿔야 함 → 환경변수로는 안 됨.
3. **재배포해도 값 유지**: KV에 저장한 값은 Vercel 재배포 후에도 그대로.

### 필요한 환경변수

```
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

Vercel Marketplace에서 Upstash 통합을 연결하면 이 두 값이 자동으로 프로젝트 env에 주입된다.

---

## 5. Supabase와의 비교 — 왜 이 프로젝트엔 Upstash인가

Supabase도 KV 저장에 쓸 수 있지만 본질적으로 다른 도구다.

| 항목 | Upstash Redis | Supabase |
|------|---------------|----------|
| 본질 | HTTP Redis (key-value) | Postgres + Auth + Storage + Realtime 풀스택 BaaS |
| 이 프로젝트 사용법 | `redis.get("student_pin")` | `settings` 테이블 만들고 row 읽기 |
| 셋업 비용 | env 변수 2개 | 프로젝트 생성 → 스키마 설계 → RLS 정책 → SDK |
| 매 요청 지연 | 수 ms (Redis GET) | 수십 ms (Postgres 쿼리) |
| 무료 티어 | 10k req/day, 256MB | 500MB DB, 50k MAU |

### Supabase가 유리한 시점

PIN 외에 **관계형 데이터**가 필요해질 때:
- 사용자별 계정, 진도, 출석 기록
- 시간순 정렬·페이지네이션이 필요한 공지
- 수업별 댓글, 피드백
- 감사 로그 (audit log)

### 이 프로젝트가 Upstash를 택한 이유

1. **KV 3쌍(PIN, 공지, 관리자 PW)만 필요** → Postgres는 우발적 복잡도 (Rich Hickey 관점에서 경계해야 할 패턴)
2. **proxy에서 매 요청 PIN 조회** → 1ms vs 수십 ms 차이가 카카오톡 인앱 브라우저 같은 느린 환경에서 체감
3. **TECHSPEC §4.1이 "KV Store" 명시** → Supabase로 가려면 스펙 수정 필요
4. **현재 로드맵에 관계형 데이터 계획 없음** — 2단계 항목(변경 알림, 멀티 시트)도 KV로 커버 가능

요약: **지금 필요한 일의 크기에 정확히 맞는 도구가 Upstash Redis**.

---

## 6. 비유로 정리

| 대상 | 비유 |
|------|------|
| Redis | 작고 빠른 메모장 — 이름 붙여 값 기억시키고 순식간에 꺼냄 |
| 직접 Redis 설치 | 내 집 부엌에 냉장고 사서 설치·전원·수리까지 직접 |
| Upstash | 공유주방 월세 — 냉장고 이미 있고 고장나면 주인이 고침 |
| @upstash/redis | 공유주방 냉장고를 여는 리모컨 — HTTP로 넣고 뺌 |
| Supabase | 공유주방 + 식당 홀 + 웨이터 + 결제기 — 풀스택. 냉장고만 필요하면 과함 |

---

## 7. 이 프로젝트가 실제 사용할 키 목록

| 키 | 값 예시 | 설정 시점 | 용도 |
|----|--------|----------|------|
| `student_pin` | `"1234"` | M11 최초 설정, M13에서 관리자 변경 | 학생 접근 PIN |
| `admin_notice` | `"4월 시간표 업데이트"` | M13 공지 작성 | 시간표 상단 배너 |
| (관리자 PW) | — | 환경변수 `ADMIN_PASSWORD`로 고정 | KV 아님 |

관리자 비밀번호는 KV가 아니라 **환경변수**에 둔다 — 변경 빈도가 낮고, KV보다 안전하다는 판단 (TECHSPEC §1.3).

---

## 참고 링크

- Redis 공식: https://redis.io/docs/
- Upstash 공식: https://upstash.com/docs/redis
- @upstash/redis: https://github.com/upstash/redis-js
- Vercel Storage (Marketplace 모델): https://vercel.com/docs/storage
