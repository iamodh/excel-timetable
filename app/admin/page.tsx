import { cookies } from "next/headers"
import AdminLoginForm from "./AdminLoginForm"

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("admin_token")?.value
  const isAuthenticated = token !== undefined && token === process.env.ADMIN_PASSWORD

  if (!isAuthenticated) {
    return <AdminLoginForm />
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-lg font-semibold text-center text-zinc-900">
          관리자 페이지
        </h1>
        <p className="text-sm text-zinc-500 text-center">
          관리자 기능은 다음 업데이트에서 추가됩니다.
        </p>
      </div>
    </div>
  )
}
