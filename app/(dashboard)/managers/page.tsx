import { createClient } from "@/lib/supabase/server";
import ManagerTable from "@/components/managers/manager-table";

export default async function ManagersPage() {
  const supabase = await createClient();
  const { data: managers, error } = await supabase
    .from("managers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">담당자 관리</h1>
        <p className="text-sm text-gray-500 mt-1">가망건 담당자를 등록하고 관리합니다.</p>
      </div>
      <ManagerTable initialManagers={managers ?? []} />
    </div>
  );
}
