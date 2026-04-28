import Link from "next/link"

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="max-w-lg mx-auto space-y-8">
        <h1 className="text-xl font-bold text-zinc-900 text-center">
          시간표 사용 가이드
        </h1>

        <section className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-800">
            시간표 확인 방법
          </h2>
          <ol className="text-sm text-zinc-700 space-y-2 list-decimal list-inside">
            <li>공유받은 링크에 접속합니다.</li>
            <li>PIN(비밀번호)을 입력합니다.</li>
            <li>시간표가 표시됩니다. 상단 탭으로 회차를 전환할 수 있습니다.</li>
          </ol>
          <p className="text-sm text-zinc-500">
            한 번 로그인하면 <strong>30일간 자동 로그인</strong>되어 다시 입력할 필요 없습니다.
          </p>
        </section>

        <section className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-800">
            PIN 안내
          </h2>
          <ul className="text-sm text-zinc-700 space-y-2 list-disc list-inside">
            <li>PIN은 학생 전체가 공유하는 비밀번호입니다.</li>
            <li>PIN이 변경되면 다음 접속 시 새 PIN을 입력해야 합니다.</li>
            <li>새 PIN을 모르면 담당자에게 문의해주세요.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-800">
            자주 묻는 질문
          </h2>
          <dl className="text-sm space-y-4">
            <div>
              <dt className="font-medium text-zinc-800">로그인이 풀렸어요.</dt>
              <dd className="text-zinc-600 mt-1">학생 로그인은 30일 후 자동으로 만료됩니다. 다시 PIN을 입력하면 됩니다.</dd>
            </div>
          </dl>
        </section>

        <div className="text-center pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 py-2 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <span>🏠</span>
            <span>시간표로 돌아가기</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
