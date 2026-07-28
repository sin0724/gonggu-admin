import { createClient } from "@/lib/supabase/server";
import ActivityTable from "@/components/activity/activity-table";
import { ActivityLog } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const supabase = await createClient();

  const { data: logs, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">활동 로그</h1>
        <p className="text-sm text-gray-500 mt-1">
          삭제된 항목의 원본과 실행자가 기록됩니다. 이 기록은 수정하거나 지울 수
          없습니다.
        </p>
      </div>

      {error ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
          <p className="font-semibold">활동 로그를 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs">
            supabase/migrations/022_activity_logs.sql 을 적용했는지 확인해 주세요.
          </p>
        </div>
      ) : (
        <ActivityTable logs={(logs as ActivityLog[]) ?? []} />
      )}
    </div>
  );
}
