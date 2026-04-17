import { createClient } from "@/lib/supabase/server";
import ProspectTable from "@/components/prospects/prospect-table";

export default async function ProspectsPage() {
  const supabase = await createClient();
  const { data: prospects, error } = await supabase
    .from("prospects")
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
        <h1 className="text-xl font-bold text-gray-900">가망건 관리</h1>
        <p className="text-sm text-gray-500 mt-1">쇼피 입점 링크를 발송한 업체를 관리합니다.</p>
      </div>
      <ProspectTable initialProspects={prospects ?? []} />
    </div>
  );
}
