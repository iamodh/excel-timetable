"use client"

export default function ErrorPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-4 text-center">
        <p className="text-sm text-zinc-700">
          시간표를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
      </div>
    </div>
  )
}
