import { Suspense } from "react"
import { cookies } from "next/headers"
import AdminLoginForm from "./AdminLoginForm"
import AdminDashboard from "./AdminDashboard"
import { getNotice } from "@/lib/notice"

export default async function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminGate />
    </Suspense>
  )
}

async function AdminGate() {
  const cookieStore = await cookies()
  const token = cookieStore.get("admin_token")?.value
  const isAuthenticated = token !== undefined && token === process.env.ADMIN_PASSWORD

  if (!isAuthenticated) {
    return <AdminLoginForm />
  }

  const currentNotice = await getNotice()
  return <AdminDashboard currentNotice={currentNotice} />
}
