"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function PinPage() {
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      })

      if (res.ok) {
        router.push("/")
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
          시간표 열람
        </h1>
        <div>
          <label htmlFor="pin" className="block text-sm text-zinc-600 mb-1">
            PIN 입력
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full border border-zinc-300 rounded px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="PIN을 입력하세요"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !pin}
          className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "확인 중..." : "확인"}
        </button>
      </form>
    </div>
  )
}
