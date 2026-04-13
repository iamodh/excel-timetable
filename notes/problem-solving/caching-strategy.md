# 캐싱 전략: Next.js On-demand Revalidation

## 배경

시간표 데이터는 모든 학생에게 동일하고, 관리자가 수정할 때만 변경된다.
매 요청마다 Google Sheets API를 호출할 필요가 없다.

## 검토한 방식들

| 방식 | API 호출 시점 | 관리자 추가 동작 | 반영 속도 |
|------|-------------|----------------|----------|
| ISR (주기적 갱신) | 일정 주기마다 (예: 5분) | 없음 | 최대 5분 지연 |
| SSG + 수동 배포 | 빌드 시 1회 | Vercel에서 재배포 클릭 | 30초~1분 (빌드) |
| On-demand Revalidation + Apps Script | 시트 수정 시 자동 | 없음 (Apps Script 세팅 필요) | 수 초 |
| **On-demand Revalidation + 최신화 버튼** | 버튼 클릭 시 1회 | 웹에서 버튼 클릭 | 수 초 |

**선택: On-demand Revalidation + 최신화 버튼**

이유:
- Apps Script 세팅 불필요
- 관리자가 시트 수정 후 웹에서 버튼 한 번 누르면 끝
- 버튼을 누르지 않으면 API 호출이 전혀 없음

## 동작 흐름

### 평상시 (시트 변경 없음)

```
학생 접속 → Vercel이 캐시된 페이지 즉시 반환 → Google Sheets API 호출 없음
```

### 최신화 버튼 클릭 시

```
1. 버튼 클릭
2. POST /api/revalidate 호출 (rate limit 체크)
3. Next.js가 revalidatePath("/") 실행
4. 서버가 Google Sheets API를 1회 호출
5. 새 데이터로 페이지를 다시 렌더링
6. 캐시를 새 페이지로 교체
7. 이후 모든 학생이 새 페이지를 봄
```

## Rate Limit

관리자 페이지가 따로 없으므로 학생도 버튼을 누를 수 있다.
학생이 반복 클릭해도 API 낭비를 막기 위해 1분에 1회로 제한한다.

## React Query와의 비교

React + NestJS 조합에서는 보통 React Query가 클라이언트 캐싱을 담당한다.

| | React Query | Next.js revalidation |
|---|---|---|
| 캐시 위치 | 브라우저 (각 사용자별) | 서버/CDN (전체 공유) |
| API 호출 | 사용자마다 각각 호출 | 서버에서 1번 호출, 모든 사용자에게 동일 결과 |
| 갱신 방식 | staleTime 경과 후 재호출 | revalidatePath() 호출 시 갱신 |

시간표처럼 모든 사용자에게 동일한 데이터는 서버 캐싱이 효율적이다.
React Query를 쓰면 학생 100명 접속 시 API가 100번 호출될 수 있다.
