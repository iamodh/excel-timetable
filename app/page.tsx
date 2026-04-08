import { getTimetableData } from "@/lib/sheets"
import type { TimetableData, Week, Slot, Category } from "@/lib/parser"

export default async function TimetablePage() {
  const data = await getTimetableData()

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <TimetableHeader data={data} />
      <CategoryLegend categories={data.categories} />
      {data.weeks.map((week) => (
        <WeekGrid key={week.weekNumber} week={week} />
      ))}
    </div>
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
    <div className="mb-4 flex flex-wrap gap-2">
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

function WeekGrid({ week }: { week: Week }) {
  const timeSlots = week.days[0]?.slots ?? []

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-lg font-semibold">{week.weekNumber}주차</h2>
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 120 }} />
            {week.days.map((day) => (
              <col key={day.date} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-zinc-100">
              <th className="border border-zinc-200 px-2 py-2 text-center font-medium">시간</th>
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
                <td className="border border-zinc-200 px-2 py-2 text-center text-zinc-500 whitespace-nowrap">
                  {week.days[0]?.slots[timeIdx]?.startTime}~{week.days[0]?.slots[timeIdx]?.endTime}
                </td>
                {week.days.map((day) => {
                  const slot = day.slots[timeIdx]
                  if (!slot || slot.isMergedContinuation) return null

                  return (
                    <SlotCell key={day.date} slot={slot} />
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

function SlotCell({ slot }: { slot: Slot }) {
  const isEmpty = !slot.title

  return (
    <td
      className="border border-zinc-200 px-2 py-2 text-center"
      rowSpan={slot.rowSpan > 1 ? slot.rowSpan : undefined}
      style={!isEmpty ? { backgroundColor: slot.bgColor } : undefined}
    >
      {slot.title && (
        <>
          <div className="font-medium">{slot.title}</div>
          {slot.subtitle && (
            <div className="text-zinc-600 mt-0.5">{slot.subtitle}</div>
          )}
        </>
      )}
    </td>
  )
}
