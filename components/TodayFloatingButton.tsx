"use client"

import Image from "next/image"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

function formatToday(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = WEEKDAYS[date.getDay()]
  return `오늘은 ${month}/${day}(${weekday})이에요!`
}

export function TodayFloatingButton() {
  const label = formatToday(new Date())

  // TODO: 클릭 시 모달 열기 (추후 구현)
  return (
    <button
      type="button"
      onClick={() => {}}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-white py-2 pl-4 pr-2 shadow-lg ring-1 ring-zinc-200 transition hover:shadow-xl active:scale-95"
      aria-label={label}
    >
      <span className="text-sm font-semibold text-zinc-800">{label}</span>
      <Image
        src="/toduck.svg"
        alt="토더기"
        width={32}
        height={32}
        className="h-8 w-8"
      />
    </button>
  )
}
