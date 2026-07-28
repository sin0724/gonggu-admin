import { fetchCrmKols } from "@/lib/supabase/crm";
import KolTable from "@/components/kols/kol-table";

// KOL 리스트는 tianxia-crm의 kols 테이블을 그대로 읽는다 (단일 소스).
// 등록·수정은 CRM에서 하고 여기서는 조회·검색만 한다.
export const dynamic = "force-dynamic";

export default async function KolsPage() {
  const { kols, error } = await fetchCrmKols();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">KOL 리스트</h1>
        <p className="text-sm text-gray-500 mt-1">
          tianxia-crm KOL 아카이브를 그대로 조회합니다. 등록·수정은 CRM에서 진행하세요.
        </p>
      </div>

      {error ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
          <p className="font-semibold">KOL 목록을 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      ) : (
        <KolTable kols={kols} />
      )}
    </div>
  );
}
