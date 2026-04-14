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
            관리자 페이지 사용법
          </h2>
          <ol className="text-sm text-zinc-700 space-y-2 list-decimal list-inside">
            <li>주소 뒤에 <code className="bg-zinc-100 px-1 rounded">/admin</code>을 붙여 접속합니다.</li>
            <li>관리자 비밀번호를 입력합니다.</li>
          </ol>
          <p className="text-sm text-zinc-500">
            한 번 로그인하면 <strong>7일간 자동 로그인</strong>됩니다.
          </p>
          <div className="text-sm text-zinc-700 space-y-2">
            <p><strong>PIN 변경</strong> — 새 PIN을 입력하고 &quot;PIN 변경&quot; 버튼을 누르면 즉시 적용됩니다.</p>
            <p><strong>시간표 최신화</strong> — Google Sheets에서 시간표를 수정한 뒤 &quot;시간표 최신화&quot; 버튼을 누르면 웹에 반영됩니다.</p>
            <p><strong>공지</strong> — 공지 내용을 입력하고 &quot;공지 등록&quot;을 누르면 시간표 상단에 표시됩니다. 필요 없어지면 &quot;삭제&quot;를 누르세요.</p>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-800">
            PIN 안내
          </h2>
          <ul className="text-sm text-zinc-700 space-y-2 list-disc list-inside">
            <li>PIN은 학생 전체가 공유하는 비밀번호입니다.</li>
            <li>PIN이 유출되었다면 관리자 페이지에서 즉시 변경할 수 있습니다.</li>
            <li>PIN을 변경하면 기존 학생들은 다음 접속 시 새 PIN을 입력해야 합니다.</li>
          </ul>
        </section>

        <section className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-800">
            자주 묻는 질문
          </h2>
          <dl className="text-sm space-y-4">
            <div>
              <dt className="font-medium text-zinc-800">시트를 수정했는데 반영이 안 돼요.</dt>
              <dd className="text-zinc-600 mt-1">관리자 페이지에서 &quot;시간표 최신화&quot; 버튼을 눌러주세요.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-800">PIN을 바꿨는데 학생들이 접속을 못해요.</dt>
              <dd className="text-zinc-600 mt-1">새 PIN을 학생들에게 다시 공유해주세요.</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-800">로그인이 풀렸어요.</dt>
              <dd className="text-zinc-600 mt-1">학생은 30일, 관리자는 7일 후 자동으로 만료됩니다. 다시 입력하면 됩니다.</dd>
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
