import { Suspense } from "react"
import Link from "next/link"
import { getAllTimetableData } from "@/lib/sheets"
import { SessionTabs } from "@/components/SessionTabs"
import { AuthGate } from "@/components/AuthGate"
import { getNotice } from "@/lib/notice"

async function NoticeBanner() {
  const notice = await getNotice()
  if (!notice) return null
  return (
    <div className="max-w-4xl mx-auto mb-4 bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded p-3">
      <p className="text-sm text-zinc-800">
        <span className="mr-1.5">📢</span>
        <span className="font-semibold text-amber-700 mr-2">공지</span>
        {notice}
      </p>
    </div>
  )
}

async function VisibleSessionTabs() {
  const sessions = await getAllTimetableData()
  return <SessionTabs sessions={sessions} />
}

function TimetableLoading() {
  return (
    <div className="max-w-4xl mx-auto py-12 flex flex-col items-center gap-3 text-zinc-500">
      <svg
        className="animate-spin h-8 w-8 text-zinc-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <p className="text-sm">시간표를 불러오는 중...</p>
    </div>
  )
}

export default function TimetablePage() {
  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      <Suspense fallback={null}>
        <NoticeBanner />
      </Suspense>
      <Suspense fallback={<TimetableLoading />}>
        <VisibleSessionTabs />
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
