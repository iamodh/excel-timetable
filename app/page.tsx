import { Suspense } from "react"
import Link from "next/link"
import { getAllTimetableData } from "@/lib/sheets"
import { SessionTabs } from "@/components/SessionTabs"
import { AuthGate } from "@/components/AuthGate"
import { getNotice } from "@/lib/notice"

export default async function TimetablePage() {
  const [sessions, notice] = await Promise.all([
    getAllTimetableData(),
    getNotice(),
  ])

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      {notice && (
        <div className="max-w-4xl mx-auto mb-4 bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded p-3">
          <p className="text-sm text-zinc-800">
            <span className="mr-1.5">📢</span>
            <span className="font-semibold text-amber-700 mr-2">공지</span>
            {notice}
          </p>
        </div>
      )}
      <Suspense fallback={null}>
        <SessionTabs sessions={sessions} />
      </Suspense>
      <div className="max-w-4xl mx-auto mt-6 pb-4 text-center">
        <Link
          href="/guide"
          className="inline-flex items-center gap-1.5 py-2 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <span>📖</span>
          <span>가이드</span>
        </Link>
      </div>
    </div>
  )
}
