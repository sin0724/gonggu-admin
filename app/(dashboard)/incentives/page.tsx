import { createClient } from "@/lib/supabase/server";
import { fetchIsAdmin } from "@/lib/admin";
import { Manager } from "@/types/database";
import {
  buildStatement,
  CampaignExpense,
  CampaignSettlement,
  IncentiveCampaign,
  IncentivePayout,
  upcomingPayMonth,
} from "@/lib/incentive";
import IncentiveStatement, {
  StatementRow,
} from "@/components/incentives/incentive-statement";

export const dynamic = "force-dynamic";

const MIGRATION_HINT = (
  <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
    <p className="font-semibold">인센티브 기능이 아직 켜지지 않았습니다.</p>
    <p className="mt-1 text-xs">
      Supabase SQL 에디터에서 supabase/migrations/025_incentives.sql 을 실행해 주세요.
    </p>
  </div>
);

export default async function IncentivesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : upcomingPayMonth();
  const supabase = await createClient();
  const [isAdmin, { data: managersData }, { data: { user } }] = await Promise.all([
    fetchIsAdmin(supabase),
    supabase.from("managers").select("*").order("name", { ascending: true }),
    supabase.auth.getUser(),
  ]);
  const managers = (managersData as Manager[]) ?? [];

  const header = (
    <div>
      <h1 className="text-xl font-bold text-gray-900">인센티브 명세표</h1>
      <p className="text-sm text-gray-500 mt-1">
        입금된 밴더 순수수료 − 직접 실비 = 기준금액 → 영업 4% · 관리 6%. 매월 10일 지급분을 확인하고
        확정합니다.
      </p>
    </div>
  );

  // 확정 명세 — 직원은 RLS로 본인 줄만 받는다
  const { data: payoutsData, error: payoutError } = await supabase
    .from("incentive_payouts")
    .select("*")
    .order("pay_month");
  if (payoutError) {
    return (
      <div className="space-y-4">
        {header}
        {MIGRATION_HINT}
      </div>
    );
  }
  const payouts = (payoutsData as IncentivePayout[]) ?? [];
  const confirmedRows = payouts.filter((p) => p.pay_month.slice(0, 7) === month);

  const toRow = (p: IncentivePayout): StatementRow => ({
    campaignId: p.campaign_id,
    campaignName: p.campaign_name,
    clientName: null,
    role: p.role,
    managerId: p.manager_id,
    managerName: p.manager_name,
    feeTotal: p.fee_total,
    expenseTotal: p.expense_total,
    base: p.base_amount,
    rate: Number(p.rate),
    entitledTotal: p.entitled_total,
    previouslyPaid: p.previously_paid,
    amount: p.amount,
  });

  // 직원 화면: 확정된 본인 명세만
  if (isAdmin !== true) {
    return (
      <div className="space-y-4">
        {header}
        <IncentiveStatement
          month={month}
          rows={confirmedRows.map(toRow)}
          confirmed={confirmedRows.length > 0 ? confirmedRows[0] : null}
          paidAt={confirmedRows.find((r) => r.paid_at)?.paid_at ?? null}
          isAdmin={false}
          managers={managers}
          viewerEmail={user?.email ?? null}
        />
      </div>
    );
  }

  // 최종 관리자: 확정 전이면 실시간 계산, 확정됐으면 스냅샷
  let rows: StatementRow[];
  if (confirmedRows.length > 0) {
    rows = confirmedRows.map(toRow);
  } else {
    const [{ data: campaigns }, { data: settlements }, { data: expenses }] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id, campaign_name, client_name, end_date, manager_id, sales_manager_id"),
      supabase.from("campaign_settlements").select("*"),
      supabase.from("campaign_expenses").select("*"),
    ]);
    const nameOf = new Map(managers.map((m) => [m.id, m.name]));
    rows = buildStatement({
      month,
      campaigns: (campaigns as IncentiveCampaign[]) ?? [],
      settlements: (settlements as CampaignSettlement[]) ?? [],
      expenses: (expenses as CampaignExpense[]) ?? [],
      payouts,
    }).map((l) => ({
      ...l,
      managerName: l.managerId ? nameOf.get(l.managerId) ?? "(삭제된 담당자)" : null,
    }));
  }

  return (
    <div className="space-y-4">
      {header}
      <IncentiveStatement
        month={month}
        rows={rows}
        confirmed={confirmedRows.length > 0 ? confirmedRows[0] : null}
        paidAt={confirmedRows.find((r) => r.paid_at)?.paid_at ?? null}
        isAdmin
        managers={managers}
        viewerEmail={user?.email ?? null}
      />
    </div>
  );
}
