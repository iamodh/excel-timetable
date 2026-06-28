"use client"

import Image from "next/image"
import { useState } from "react"
import type { TimetableData } from "@/lib/parser"
import { computeOverallProgress } from "@/lib/progress"

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

function formatToday(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = WEEKDAYS[date.getDay()]
  return `오늘은 ${month}/${day}(${weekday})이에요!`
}

export function TodayFloatingButton({ sessions }: { sessions: TimetableData[] }) {
  const [open, setOpen] = useState(false)
  const label = formatToday(new Date())

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-white py-2 pl-4 pr-2 shadow-lg ring-1 ring-zinc-200 transition hover:shadow-xl active:scale-95"
          aria-label={label}
        >
          <span className="text-sm font-semibold text-zinc-800">{label}</span>
          <Image src="/toduck.svg" alt="토더기" width={32} height={32} className="h-8 w-8" />
        </button>
      )}
      {open && (
        <TodayModal label={label} sessions={sessions} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function TodayModal({
  label,
  sessions,
  onClose,
}: {
  label: string
  sessions: TimetableData[]
  onClose: () => void
}) {
  const progress = computeOverallProgress(sessions, new Date())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm animate-[popIn_0.18s_ease-out] rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Image src="/toduck.svg" alt="토더기" width={48} height={48} className="h-12 w-12" />
          <div className="text-lg font-bold text-zinc-900">{label}</div>
        </div>

        <div className="my-4 border-t border-zinc-200" />

        {progress.totalHours > 0 ? (
          <ProgressBody progress={progress} />
        ) : (
          <p className="py-4 text-center text-sm text-zinc-600">
            아직 진행 중인 과정이 없어요.
          </p>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-zinc-800 py-2.5 text-sm font-medium text-white"
        >
          닫기
        </button>
      </div>
    </div>
  )
}

function ProgressBody({
  progress,
}: {
  progress: ReturnType<typeof computeOverallProgress>
}) {
  const { phase, percent, pastHours, totalHours, daysUntilStart } = progress

  if (phase === "before") {
    return (
      <div>
        <div className="text-center">
          <div className="text-sm text-zinc-500">개강까지</div>
          <div className="text-3xl font-extrabold text-emerald-600">
            D-{daysUntilStart}
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-zinc-600">
          총 {totalHours}시간 과정이 예정되어 있어요.
        </p>
      </div>
    )
  }

  const headline =
    phase === "done"
      ? "수료 완료 🎉"
      : `${pastHours} / ${totalHours}시간 함께했어요`

  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between">
        <span className="text-sm font-medium text-zinc-700">{headline}</span>
        <span className="text-sm font-bold text-emerald-600">{percent}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
