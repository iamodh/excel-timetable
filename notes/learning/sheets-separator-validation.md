# 구분 열 검증 — 값 검사와 병합 검사가 독립적인 이유

## 배경

시트 구조: 한 탭에 6열 고정 블록(회차)이 1열 간격으로 가로 반복.

- 블록 N(0-indexed)의 열 범위: `[N*7, N*7+5]`
- 구분 열: `N*7 + 6` (G, N, U, AB)

관리자가 시트를 편집하다 **블록 경계가 깨지면** 파서가 오른쪽 블록을 잘못 읽게 된다. 이를 막기 위해 파싱 직전에 구분 열 무결성을 검증한다.

## 두 가지 검증 조건

### A. 구분 열에 값 없음

```
cells[row][sepCol].formattedValue === undefined || ""
```

### B. 구분 열을 가로지르는 병합 없음

```
for merge in merges:
    if merge.startColumnIndex <= sepCol < merge.endColumnIndex
       AND (merge.endColumnIndex - merge.startColumnIndex) > 1:
        → 위반
```

## 왜 두 개가 모두 필요한가

**핵심: Google Sheets API는 병합 셀의 값을 왼쪽 위 셀에만 저장한다.**

```
F4:G4 가로 병합 + "수업명" 입력
  → F4.formattedValue = "수업명"
  → G4.formattedValue = undefined  ← 빈 값으로 보임
```

즉 구분 열 G가 옆 블록 셀과 병합되어도, G의 `formattedValue`는 빈 값이라 **조건 A만으로는 탐지 불가**. 병합 정보 자체를 봐야 한다.

## 케이스별 판정

| 상황 | 조건 A | 조건 B | 결과 |
|---|---|---|---|
| G4에 직접 "쉬는시간" 타이핑 | 🔴 값 있음 | 🟢 병합 없음 | A가 잡음 |
| F4:G4 가로 병합, F4에 값 | 🟢 G4 빈값 | 🔴 폭 2의 병합이 G 포함 | **B가 잡음** |
| G4:G7 세로 병합, 값 없음 | 🟢 빈값 | 🟢 폭 1 | 통과 (정상) |
| 블록 내부 병합 C4:D4 | — | 구분 열 미포함 → 무시 | 통과 |

## 에러 메시지 포맷

관리자가 바로 수정할 수 있게 **블록 번호 + 열 문자 + 구체 위치** 포함.

```
블록 2 구분 열(N) 위반: 행 6 병합이 M~N 열에 걸쳐있습니다
블록 1 구분 열(G) 위반: G4 셀에 값이 있습니다 ("쉬는시간")
```

## 구현 위치

- `lib/parser.ts` — `validateSeparatorColumns(rowData, merges, blockCount)` 신규
- `fetchTimetableData()` 또는 파싱 진입점에서 호출, 위반 시 throw
- `/api/revalidate` 응답이 에러 메시지를 관리자 UI로 전달
