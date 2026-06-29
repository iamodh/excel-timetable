import { useEffect, useState } from "react"

// value가 null이 되면 닫기(exit) 애니메이션 동안 마지막 값을 durationMs만큼 유지한 뒤 제거한다.
// closing이 true인 구간에 닫기 애니메이션 클래스를 적용하면 된다.
// 닫는 중 다시 열리면(value가 다시 non-null) 닫기를 취소하고 새 값을 표시한다.
export function useExitTransition<T>(
  value: T | null,
  durationMs: number,
): { rendered: T | null; closing: boolean } {
  const [rendered, setRendered] = useState<T | null>(value)

  // 열려 있을 땐 렌더 중 즉시 동기화한다 (effect 불필요)
  if (value !== null && value !== rendered) {
    setRendered(value)
  }

  const closing = value === null && rendered !== null

  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(() => setRendered(null), durationMs)
    return () => clearTimeout(timer)
  }, [closing, durationMs])

  return { rendered, closing }
}
