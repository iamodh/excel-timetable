"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AdminLoginForm() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.refresh()
      } else {
        const body = await res.json()
        setError(body.message || "인증에 실패했습니다.")
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-4"
      >
        <h1 className="text-lg font-semibold text-center text-zinc-900">
          관리자 로그인
        </h1>
        <div>
          <label htmlFor="password" className="block text-sm text-zinc-600 mb-1">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-zinc-300 rounded px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="비밀번호를 입력하세요"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "확인 중..." : "로그인"}
        </button>
      </form>
    </div>
  )
}
