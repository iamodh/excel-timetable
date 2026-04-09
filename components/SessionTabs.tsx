"use client"

import { useState } from "react"
import type { TimetableData } from "@/lib/parser"
import { determineCurrentSession } from "@/lib/session"

export function SessionTabs({
  sessions,
  children,
}: {
  sessions: TimetableData[]
  children: (data: TimetableData) => React.ReactNode
}) {
  const [current, setCurrent] = useState(() => determineCurrentSession(sessions))

  return (
    <>
      <nav className="mb-4 flex gap-2 overflow-x-auto">
        {sessions.map((s, i) => (
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
      {children(sessions[current])}
    </>
  )
}
