"use client"

import { useEffect, useRef, useState } from "react"
import type { TimetableData, Week, Slot, Category } from "@/lib/parser"
import { determineCurrentSession, filterVisibleSessions } from "@/lib/session"
import { shouldDimSlotForCategory } from "@/lib/categoryHighlight"

type SelectedSlot = { slot: Slot; date: string; dayOfWeek: string }

export function SessionTabs({
  sessions,
  highlightCategory,
}: {
  sessions: TimetableData[]
  highlightCategory?: string
}) {
  const visibleSessions = filterVisibleSessions(sessions, new Date())
  const [current, setCurrent] = useState(() =>
    determineCurrentSession(visibleSessions)
  )
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    nav.scrollLeft = nav.scrollWidth
  }, [])

  const data = visibleSessions[current]

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto rounded-lg bg-white p-6 text-center text-sm text-zinc-600 shadow-sm">
        아직 공개된 시간표가 없습니다.
      </div>
    )
  }

  return (
    <>
      <nav ref={navRef} className="mb-4 flex gap-2 overflow-x-auto">
        {visibleSessions.map((s, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              i === current
                ? "bg-zinc-800 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {s.programName}
          </button>
        ))}
      </nav>
      <TimetableHeader data={data} />
      <CategoryLegend categories={data.categories} />
      <TimetableGrid
        data={data}
        highlightCategory={highlightCategory}
        onSelectSlot={setSelectedSlot}
      />
      <VenueSheet selected={selectedSlot} onClose={() => setSelectedSlot(null)} />
    </>
  )
}

export function TimetableGrid({
  data,
  highlightCategory,
  onSelectSlot,
}: {
  data: TimetableData
  highlightCategory?: string
  onSelectSlot?: (selected: SelectedSlot) => void
}) {
  return (
    <>
      {data.weeks.map((week) => (
        <WeekGrid
          key={week.weekNumber}
          week={week}
          categories={data.categories}
          highlightCategory={highlightCategory}
          onSelectSlot={onSelectSlot}
        />
      ))}
    </>
  )
}

function TimetableHeader({ data }: { data: TimetableData }) {
  return (
    <header className="mb-4 rounded-lg bg-white p-4 shadow-sm">
      <h1 className="text-xl font-bold">{data.programName}</h1>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600">
        <span>기간: {data.period}</span>
        <span>장소: {data.location}</span>
        <span>이수시간: {data.totalHours}</span>
      </div>
    </header>
  )
}

function CategoryLegend({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null

  return (
    <div className="sticky top-0 z-30 mb-4 flex flex-wrap gap-2 bg-zinc-50 py-2">
      {categories.map((cat) => (
        <span
          key={cat.name}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs"
          style={{ backgroundColor: cat.color }}
        >
          {cat.name}
        </span>
      ))}
    </div>
  )
}

const TIME_COL_WIDTH = 100
const DAY_COL_WIDTH = 120

function WeekGrid({
  week,
  categories,
  highlightCategory,
  onSelectSlot,
}: {
  week: Week
  categories: Category[]
  highlightCategory?: string
  onSelectSlot?: (selected: SelectedSlot) => void
}) {
  const timeSlots = week.days[0]?.slots ?? []
  const tableWidth = TIME_COL_WIDTH + week.days.length * DAY_COL_WIDTH

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">{week.weekNumber}주차</h2>
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table
          className="border-collapse text-sm"
          style={{ tableLayout: "fixed", width: tableWidth }}
        >
          <colgroup>
            <col style={{ width: TIME_COL_WIDTH }} />
            {week.days.map((day) => (
              <col key={day.date} style={{ width: DAY_COL_WIDTH }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-zinc-100">
              <th className="sticky left-0 z-20 bg-zinc-100 border border-zinc-200 px-2 py-2 text-center font-medium">시간</th>
              {week.days.map((day) => (
                <th key={day.date} className="border border-zinc-200 px-2 py-2 text-center font-medium">
                  <div>{day.date}</div>
                  <div className="text-zinc-500">({day.dayOfWeek})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((_, timeIdx) => (
              <tr key={timeIdx}>
                <td className="sticky left-0 z-10 bg-white border border-zinc-200 px-2 py-2 text-center text-zinc-500 whitespace-nowrap">
                  {week.days[0]?.slots[timeIdx]?.startTime}~{week.days[0]?.slots[timeIdx]?.endTime}
                </td>
                {week.days.map((day) => {
                  const slot = day.slots[timeIdx]
                  if (!slot || slot.isMergedContinuation) return null

                  return (
                    <SlotCell
                      key={day.date}
                      slot={slot}
                      date={day.date}
                      dayOfWeek={day.dayOfWeek}
                      categories={categories}
                      highlightCategory={highlightCategory}
                      onSelectSlot={onSelectSlot}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SlotCell({
  slot,
  date,
  dayOfWeek,
  categories,
  highlightCategory,
  onSelectSlot,
}: {
  slot: Slot
  date: string
  dayOfWeek: string
  categories: Category[]
  highlightCategory?: string
  onSelectSlot?: (selected: SelectedSlot) => void
}) {
  const isEmpty = !slot.title
  const isDimmed = !isEmpty && shouldDimSlotForCategory(
    slot.bgColor,
    categories,
    highlightCategory
  )
  const isClickable = !!slot.venue && !!onSelectSlot

  return (
    <td
      className={`border border-zinc-200 px-2 py-2 text-center ${isClickable ? "cursor-pointer" : ""}`}
      rowSpan={slot.rowSpan > 1 ? slot.rowSpan : undefined}
      style={!isEmpty ? { backgroundColor: isDimmed ? "#f4f4f5" : slot.bgColor } : undefined}
      onClick={isClickable ? () => onSelectSlot!({ slot, date, dayOfWeek }) : undefined}
    >
      {slot.title && (
        <>
          <div className="font-medium" style={{ color: isDimmed ? "#71717a" : slot.textColor }}>
            {slot.title}
            {isClickable && <span className="ml-1 text-xs opacity-70">📍</span>}
          </div>
          {slot.subtitle && (
            <div className={`mt-0.5 ${isDimmed ? "text-zinc-400" : "text-zinc-600"}`}>{slot.subtitle}</div>
          )}
        </>
      )}
    </td>
  )
}

function VenueSheet({
  selected,
  onClose,
}: {
  selected: SelectedSlot | null
  onClose: () => void
}) {
  if (!selected) return null

  const { slot, date, dayOfWeek } = selected

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 animate-[slideUp_0.2s_ease-out] rounded-t-2xl bg-white p-5 shadow-2xl">
        <div className="mx-auto max-w-md">
          <div className="text-sm text-zinc-500">
            {date}({dayOfWeek}) {slot.startTime}
          </div>
          <div className="mt-1 text-lg font-bold">{slot.title}</div>
          {slot.subtitle && (
            <div className="mt-0.5 text-sm text-zinc-600">{slot.subtitle}</div>
          )}
          <div className="my-4 border-t border-zinc-200" />
          <div className="flex items-start gap-2 text-zinc-800">
            <span aria-hidden>📍</span>
            <span className="whitespace-pre-wrap break-words">{slot.venue}</span>
          </div>
          <button
            onClick={onClose}
            className="mt-5 w-full rounded-lg bg-zinc-800 py-2.5 text-sm font-medium text-white"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  )
}
