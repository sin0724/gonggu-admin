import { createClient } from "@/lib/supabase/server";
import ManagerTable, {
  ManagerCampaign,
  ManagerProspect,
} from "@/components/managers/manager-table";
import { Manager } from "@/types/database";
import { canManageManagers, fetchIsAdmin } from "@/lib/admin";

export default async function ManagersPage() {
  const supabase = await createClient();
  const [{ data: managers, error }, campaignsRes, { data: prospects }, isAdmin] =
    await Promise.all([
      supabase.from("managers").select("*").order("created_at", { ascending: true }),
      supabase
        .from("campaigns")
        .select("id, campaign_name, client_name, status, start_date, end_date, manager_id")
        .order("created_at", { ascending: false }),
      supabase.from("prospects").select("id, company_name, manager_id"),
      fetchIsAdmin(supabase),
    ]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  // manager_id 컬럼이 없으면(024 미적용) 캠페인 담당 집계만 빼고 화면은 띄운다
  const migrationMissing = !!campaignsRes.error || isAdmin === null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">담당자 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          거래처를 맡는 <b className="text-sky-700">영업 담당자</b>와 캠페인을 운영하는{" "}
          <b className="text-emerald-700">관리 담당자</b>를 관리합니다. 퇴사·인수인계 때는
          &apos;인수인계&apos;로 맡던 캠페인과 거래처를 한 번에 넘깁니다.
        </p>
      </div>

      {migrationMissing && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
          <p className="font-semibold">담당자 구분·캠페인 배정 기능이 아직 켜지지 않았습니다.</p>
          <p className="mt-1 text-xs">
            Supabase SQL 에디터에서 supabase/migrations/024_manager_roles_and_campaign_assignment.sql
            을 실행해 주세요.
          </p>
        </div>
      )}

      <ManagerTable
        managers={(managers as Manager[]) ?? []}
        campaigns={(campaignsRes.data as ManagerCampaign[]) ?? []}
        prospects={(prospects as ManagerProspect[]) ?? []}
        canManage={canManageManagers(isAdmin)}
      />
    </div>
  );
}
