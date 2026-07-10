// (dashboard) 하위 모든 페이지 전환 시 표시되는 스켈레톤.
// 대시보드가 외부 재무 DB를 실시간으로 읽어 첫 로딩이 느릴 수 있어 체감 속도를 보완한다.
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 통계 카드 스켈레톤 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-3 w-20 bg-gray-200 rounded" />
                <div className="h-8 w-16 bg-gray-200 rounded" />
                <div className="h-2.5 w-28 bg-gray-100 rounded" />
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-xl" />
            </div>
          </div>
        ))}
      </div>

      {/* 돈 지표 카드 스켈레톤 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-2">
            <div className="h-5 w-24 bg-gray-100 rounded-md" />
            <div className="h-7 w-32 bg-gray-200 rounded" />
            <div className="h-2.5 w-40 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* 테이블 스켈레톤 */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="h-4 w-28 bg-gray-200 rounded" />
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-6 py-4">
              <div className="h-3.5 w-40 bg-gray-200 rounded" />
              <div className="h-3.5 w-24 bg-gray-100 rounded" />
              <div className="h-3.5 w-32 bg-gray-100 rounded hidden md:block" />
              <div className="h-5 w-14 bg-gray-100 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
