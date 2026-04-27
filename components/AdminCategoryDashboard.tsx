"use client"

import Link from "next/link"
import { useState } from "react"
import { CategoryMatrix } from "@/components/CategoryMatrix"
import { TimetableGrid } from "@/components/SessionTabs"
import type { CategorySessionHours } from "@/lib/categoryStats"
import type { TimetableData } from "@/lib/parser"

export function AdminCategoryDashboard({
  sessions,
  summaries,
}: {
  sessions: TimetableData[]
  summaries: CategorySessionHours[]
}) {
  const [currentSessionIndex, setCurrentSessionIndex] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const currentSession = sessions[currentSessionIndex]

  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-zinc-900">카테고리 합계</h1>
          <Link
            href="/admin"
            className="inline-flex items-center rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            관리자 홈
          </Link>
        </div>

        <CategoryMatrix
          summaries={summaries}
          sessionNames={sessions.map((session) => session.programName)}
          selectedCategory={selectedCategory}
          onSelectedCategoryChange={setSelectedCategory}
        />

        <nav className="flex gap-2 overflow-x-auto">
          {sessions.map((session, index) => (
            <button
              key={session.programName}
              type="button"
              onClick={() => setCurrentSessionIndex(index)}
              className={`whitespace-nowrap rounded px-4 py-2 text-sm font-medium transition-colors ${
                index === currentSessionIndex
                  ? "bg-zinc-800 text-white"
                  : "bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {session.programName}
            </button>
          ))}
        </nav>

        {currentSession ? (
          <TimetableGrid
            data={currentSession}
            highlightCategory={selectedCategory ?? undefined}
          />
        ) : (
          <div className="rounded bg-white p-6 text-center text-sm text-zinc-600 shadow-sm">
            표시할 시간표가 없습니다.
          </div>
        )}
      </div>
    </main>
  )
}
