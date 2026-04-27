import { Suspense } from "react"
import { cookies } from "next/headers"
import AdminLoginForm from "../AdminLoginForm"
import { AdminCategoryDashboard } from "@/components/AdminCategoryDashboard"
import { summarizeCategoryHoursBySession } from "@/lib/categoryStats"
import { getAllTimetableData } from "@/lib/sheets"

export default async function AdminCategoriesPage() {
  return (
    <Suspense fallback={null}>
      <AdminCategoriesGate />
    </Suspense>
  )
}

async function AdminCategoriesGate() {
  const cookieStore = await cookies()
  const token = cookieStore.get("admin_token")?.value
  const isAuthenticated = token !== undefined && token === process.env.ADMIN_PASSWORD

  if (!isAuthenticated) {
    return <AdminLoginForm />
  }

  const sessions = await getAllTimetableData()
  const summaries = summarizeCategoryHoursBySession(sessions)

  return <AdminCategoryDashboard sessions={sessions} summaries={summaries} />
}
