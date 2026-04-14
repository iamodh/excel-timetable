"use client"

import { useState } from "react"
import Link from "next/link"

export default function AdminDashboard({ currentNotice }: { currentNotice: string | null }) {
  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="max-w-sm mx-auto space-y-6">
        <h1 className="text-lg font-semibold text-center text-zinc-900">
          관리자 페이지
        </h1>
        <PinChangeSection />
        <RevalidateSection />
        <NoticeSection currentNotice={currentNotice} />
        <div className="text-center pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 py-2 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <span>🏠</span>
            <span>시간표 보기</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function PinChangeSection() {
  const [pin, setPin] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage("")
    setLoading(true)

    try {
      const res = await fetch("/api/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      })
      const body = await res.json()
      setMessage(body.message)
      if (res.ok) setPin("")
    } catch {
      setMessage("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-700">PIN 변경</h2>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="새 PIN 입력"
          className="w-full border border-zinc-300 rounded px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !pin}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "변경 중..." : "PIN 변경"}
        </button>
      </form>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </section>
  )
}

function RevalidateSection() {
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setMessage("")
    setLoading(true)

    try {
      const res = await fetch("/api/revalidate", { method: "POST" })
      const body = await res.json()
      setMessage(body.message)
    } catch {
      setMessage("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-700">시간표 최신화</h2>
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "최신화 중..." : "시간표 최신화"}
      </button>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </section>
  )
}

function NoticeSection({ currentNotice }: { currentNotice: string | null }) {
  const [notice, setNotice] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [displayed, setDisplayed] = useState(currentNotice)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage("")
    setLoading(true)

    try {
      const res = await fetch("/api/notice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: notice }),
      })
      const body = await res.json()
      setMessage(body.message)
      if (res.ok) {
        setDisplayed(notice)
        setNotice("")
      }
    } catch {
      setMessage("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setMessage("")
    setLoading(true)

    try {
      const res = await fetch("/api/notice", { method: "DELETE" })
      const body = await res.json()
      setMessage(body.message)
      if (res.ok) setDisplayed(null)
    } catch {
      setMessage("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-700">공지</h2>
      {displayed && (
        <div className="flex items-start justify-between gap-2 bg-yellow-50 border border-yellow-200 rounded p-2">
          <p className="text-sm text-zinc-700">{displayed}</p>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="text-xs text-red-600 hover:text-red-800 shrink-0"
          >
            삭제
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={notice}
          onChange={(e) => setNotice(e.target.value)}
          placeholder="공지 내용 입력"
          className="w-full border border-zinc-300 rounded px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !notice}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "등록 중..." : "공지 등록"}
        </button>
      </form>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </section>
  )
}
