import { getAllTimetableData } from "@/lib/sheets"
import { SessionTabs } from "@/components/SessionTabs"

export default async function TimetablePage() {
  const sessions = await getAllTimetableData()

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <SessionTabs sessions={sessions} />
    </div>
  )
}
