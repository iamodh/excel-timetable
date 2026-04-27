"use client"

import { buildCategoryMatrixRows } from "@/lib/categoryMatrix"
import type { CategorySessionHours } from "@/lib/categoryStats"

interface CategoryMatrixProps {
  summaries: CategorySessionHours[]
  sessionNames: string[]
  selectedCategory: string | null
  onSelectedCategoryChange: (categoryName: string | null) => void
}

export function CategoryMatrix({
  summaries,
  sessionNames,
  selectedCategory,
  onSelectedCategoryChange,
}: CategoryMatrixProps) {
  const rows = buildCategoryMatrixRows(summaries)
  const firstNoTargetIndex = rows.findIndex((row) => row.targetHours === null)

  return (
    <div className="overflow-x-auto bg-white shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-zinc-100 text-zinc-700">
            <th className="sticky left-0 z-10 border border-zinc-200 bg-zinc-100 px-3 py-2 text-left font-semibold">
              카테고리
            </th>
            {sessionNames.map((name) => (
              <th
                key={name}
                className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-right font-semibold"
              >
                {name}
              </th>
            ))}
            <th className="border border-zinc-200 px-3 py-2 text-right font-semibold">합계</th>
            <th className="border border-zinc-200 px-3 py-2 text-right font-semibold">목표</th>
            <th className="border border-zinc-200 px-3 py-2 text-right font-semibold">부족</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const selected = selectedCategory === row.categoryName
            const showSeparator = rowIndex === firstNoTargetIndex

            return (
              <tr
                key={row.categoryName}
                role="button"
                tabIndex={0}
                onClick={() =>
                  onSelectedCategoryChange(selected ? null : row.categoryName)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelectedCategoryChange(selected ? null : row.categoryName)
                  }
                }}
                className={`cursor-pointer transition-colors hover:bg-zinc-50 ${
                  selected ? "bg-blue-50" : "bg-white"
                } ${showSeparator ? "border-t-4 border-t-zinc-300" : ""}`}
              >
                <td className="sticky left-0 z-10 border border-zinc-200 bg-inherit px-3 py-2 font-medium text-zinc-900">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm border border-zinc-300"
                      style={{ backgroundColor: row.color }}
                    />
                    {row.categoryName}
                  </span>
                </td>
                {row.sessionHours.map((hours, index) => (
                  <td
                    key={index}
                    className={`border border-zinc-200 bg-zinc-50 px-3 py-2 text-right tabular-nums ${
                      hours === 0 ? "text-zinc-300" : "text-zinc-700"
                    }`}
                  >
                    {hours}
                  </td>
                ))}
                <td className="border border-zinc-200 px-3 py-2 text-right font-semibold tabular-nums text-zinc-900">
                  {row.totalHours}
                </td>
                <td className="border border-zinc-200 px-3 py-2 text-right tabular-nums text-zinc-700">
                  {row.targetHours ?? "-"}
                </td>
                <td className="border border-zinc-200 px-3 py-2 text-right tabular-nums text-zinc-700">
                  {row.remainingHours ?? "-"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
