import { getAllTimetableData } from "@/lib/sheets"
import { SessionTabs } from "@/components/SessionTabs"
import { getNotice } from "@/lib/notice"

export default async function TimetablePage() {
  const [sessions, notice] = await Promise.all([
    getAllTimetableData(),
    getNotice(),
  ])

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      {notice && (
        <div className="max-w-4xl mx-auto mb-4 bg-yellow-50 border border-yellow-200 rounded p-3">
          <p className="text-sm text-zinc-700">{notice}</p>
        </div>
      )}
      <SessionTabs sessions={sessions} />
    </div>
  )
}
