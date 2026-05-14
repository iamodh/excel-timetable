"use client"

import { useState } from "react"

export function NoticeToggle({ notice }: { notice: string }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const firstLine = notice.split("\n")[0]

  return (
    <div className="max-w-4xl mx-auto mb-4 bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 p-3 text-sm text-zinc-800"
        aria-expanded={isExpanded}
      >
        <span aria-hidden>📢</span>
        <span className="font-semibold text-amber-700 shrink-0">공지</span>
        <span className="truncate text-zinc-700 mr-auto min-w-0">
          {!isExpanded && `${firstLine}...`}
        </span>
        <span className="shrink-0" aria-hidden>
          {isExpanded ? "🔼" : "🔽"}
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 text-sm text-zinc-800 whitespace-pre-wrap">
          {notice}
        </div>
      )}
    </div>
  )
}
