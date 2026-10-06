"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Manager } from "@/types/database";
import { useToast } from "@/components/ui/toast";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import HelpTip from "@/components/ui/help-tip";
import { logDeletion } from "@/lib/activity-log";
import { formatDate, formatWon } from "@/lib/utils";
import {
  CampaignExpense,
  CampaignSettlement,
  EXPENSE_CATEGORIES,
  EXPENSE_LABEL,
  ExpenseCategory,
  monthLabel,
  payDayLabel,
  payMonthFor,
  summarizeCampaign,
} from "@/lib/incentive";

interface IncentivePanelProps {
  campaign: {
    id: string;
    campaign_name: string;
    client_name: string;
    end_date: string | null;
    deal_type: string | null;
    manager_id?: string | null;
    sales_manager_id?: string | null;
    paid_seeding_amount?: number | null;
  };
  settlements: CampaignSettlement[];
  expenses: CampaignExpense[];
  managers: Manager[];
}

/** 숫자 입력 문자열 → 정수. 쉼표 허용, 빈 값은 null */
function parseWon(v: string): number | null {
  const n = Number(v.replace(/[,\s원]/g, ""));
  return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n);
}

const won = (n: number | null | undefined) =>
  n === null || n === undefined ? <span className="text-gray-300">-</span> : formatWon(n);

type SettlementForm = {
  statement_date: string;
  order_amount: string;
  adjustment_amount: string;
  adjustment_note: string;
  vendor_fee: string;
  deposit_amount: string;
  deposited_on: string;
  memo: string;
};

const EMPTY_SETTLEMENT: SettlementForm = {
  statement_date: "",
  order_amount: "",
  adjustment_amount: "",
  adjustment_note: "",
  vendor_fee: "",
  deposit_amount: "",
  deposited_on: "",
  memo: "",
};

type ExpenseForm = {
  category: ExpenseCategory;
  amount: string;
  spent_on: string;
  description: string;
  evidence_url: string;
};

const EMPTY_EXPENSE: ExpenseForm = {
  category: "ads",
  amount: "",
  spent_on: "",
  description: "",
  evidence_url: "",
};

/**
 * 캠페인 상세 — 인센티브 정산 (최종 관리자 전용).
 * 정산서·입금을 한 줄씩, 직접 실비를 한 줄씩 기록하면 기준금액과 영업 4%·관리 6%가 계산된다.
 */
export default function IncentivePanel({
  campaign,
  settlements,
  expenses,
  managers,
}: IncentivePanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [settlementForm, setSettlementForm] = useState<SettlementForm | null>(null);
  const [editingSettlement, setEditingSettlement] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm | null>(null);
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "settlement"; row: CampaignSettlement } | { kind: "expense"; row: CampaignExpense } | null
  >(null);
  const [seeding, setSeeding] = useState(campaign.paid_seeding_amount?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const sum = summarizeCampaign(campaign, settlements, expenses);
  const nameOf = (id: string | null | undefined) =>
    id ? managers.find((m) => m.id === id)?.name ?? "(삭제된 담당자)" : null;
  const salesName = nameOf(campaign.sales_manager_id);
  const opsName = nameOf(campaign.manager_id);
  const isSupply = campaign.deal_type === "supply";

  const actor = async () => {
    const { data } = await createClient().auth.getUser();
    return data.user?.email ?? null;
  };

  const saveSettlement = async () => {
    if (!settlementForm) return;
    const fee = parseWon(settlementForm.vendor_fee);
    if (fee === null) {
      toast.error("밴더 순수수료를 입력하세요. (환불 조정이면 음수)");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        campaign_id: campaign.id,
        statement_date: settlementForm.statement_date || null,
        order_amount: parseWon(settlementForm.order_amount),
        adjustment_amount: parseWon(settlementForm.adjustment_amount),
        adjustment_note: settlementForm.adjustment_note || null,
        vendor_fee: fee,
        deposit_amount: parseWon(settlementForm.deposit_amount),
        deposited_on: settlementForm.deposited_on || null,
        memo: settlementForm.memo || null,
      };
      const { error } = editingSettlement
        ? await supabase.from("campaign_settlements").update(payload).eq("id", editingSettlement)
        : await supabase.from("campaign_settlements").insert({ ...payload, created_by: await actor() });
      if (error) throw error;
      toast.success("정산 기록을 저장했습니다.");
      setSettlementForm(null);
      setEditingSettlement(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const saveExpense = async () => {
    if (!expenseForm) return;
    const amount = parseWon(expenseForm.amount);
    if (amount === null || amount <= 0) {
      toast.error("금액(VAT 제외)을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        campaign_id: campaign.id,
        category: expenseForm.category,
        amount,
        spent_on: expenseForm.spent_on || null,
        description: expenseForm.description || null,
        evidence_url: expenseForm.evidence_url || null,
      };
      const { error } = editingExpense
        ? await supabase.from("campaign_expenses").update(payload).eq("id", editingExpense)
        : await supabase.from("campaign_expenses").insert({ ...payload, created_by: await actor() });
      if (error) throw error;
      toast.success("직접 실비를 저장했습니다.");
      setExpenseForm(null);
      setEditingExpense(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const saveSeeding = async () => {
    const v = parseWon(seeding);
    if (v === (campaign.paid_seeding_amount ?? null)) return;
    const { error } = await createClient()
      .from("campaigns")
      .update({ paid_seeding_amount: v })
      .eq("id", campaign.id);
    if (error) toast.error(error.message);
    else {
      toast.success("유가시딩 금액을 저장했습니다.");
      router.refresh();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const isSettlement = deleteTarget.kind === "settlement";
      await logDeletion({
        entityType: isSettlement ? "campaign_settlement" : "campaign_expense",
        entityId: deleteTarget.row.id,
        entityLabel: isSettlement
          ? `정산 ${formatWon((deleteTarget.row as CampaignSettlement).vendor_fee)}`
          : `${EXPENSE_LABEL[(deleteTarget.row as CampaignExpense).category]} ${formatWon((deleteTarget.row as CampaignExpense).amount)}`,
        context: `${campaign.client_name} · ${campaign.campaign_name}`,
        snapshot: deleteTarget.row,
      });
      const { error } = await supabase
        .from(isSettlement ? "campaign_settlements" : "campaign_expenses")
        .delete()
        .eq("id", deleteTarget.row.id);
      if (error) throw error;
      toast.success("삭제했습니다.");
      setDeleteTarget(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "삭제 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 정산 줄별 지급월 — 같은 캠페인이라도 입금 시점에 따라 나뉠 수 있다
  const payMonths = Array.from(
    new Set(
      settlements
        .map((s) => payMonthFor(campaign.end_date, s.deposited_on))
        .filter((m): m is string => !!m)
    )
  ).sort();

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 flex-wrap px-5 pt-5 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center">
            인센티브 정산
            <span className="badge bg-gray-900 text-white ml-2">최종 관리자 전용</span>
            <HelpTip
              align="left"
              text="기준금액 = 입금된 밴더 순수수료(VAT 제외) − 직접 실비. 마이너스면 0. 영업 담당 4%, 관리 담당 6%. 지급일은 캠페인 종료일과 입금일 중 늦은 날이 속한 달의 다음 달 10일입니다."
            />
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            정산서가 오거나 입금될 때마다 한 줄씩 기록하세요. 입금일이 없는 줄(미수)은 계산에서 빠집니다.
          </p>
        </div>
        <Link href="/incentives" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          월별 명세표 →
        </Link>
      </div>

      {/* 계산 요약 — 보상안 산정식 순서 그대로 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-100 border-b border-gray-100">
        {[
          { label: "입금된 순수수료", value: formatWon(sum.feeEligible), sub: sum.feeUnpaid !== 0 ? `미수 ${formatWon(sum.feeUnpaid)} 제외` : "VAT 제외" },
          { label: "− 직접 실비", value: formatWon(sum.expenseTotal), sub: `${expenses.length}건` },
          { label: "= 기준금액", value: formatWon(sum.base), sub: sum.feeEligible - sum.expenseTotal < 0 ? "실비가 더 커서 0 처리" : "인센티브 기준", strong: true },
          { label: "영업 4%", value: formatWon(sum.sales), sub: salesName ?? "영업 담당 미지정 — 지급 보류", warn: !salesName },
          { label: "관리 6%", value: formatWon(sum.ops), sub: opsName ?? "관리 담당 미지정 — 지급 보류", warn: !opsName },
        ].map((k) => (
          <div key={k.label} className="bg-white px-5 py-4">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${k.strong ? "text-primary-700" : "text-gray-900"}`}>
              {k.value}
            </p>
            <p className={`text-xs mt-0.5 ${k.warn ? "text-amber-600 font-medium" : "text-gray-400"}`}>{k.sub}</p>
          </div>
        ))}
      </div>
      {payMonths.length > 0 && (
        <p className="px-5 py-2 text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
          지급 예정:{" "}
          {payMonths.map((m) => `${monthLabel(m)} 명세 (${payDayLabel(m)})`).join(", ")}
        </p>
      )}

      {/* 정산·입금 */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          정산·입금 기록
          <span className="text-xs font-normal text-gray-400 ml-2">
            {isSupply ? "공급가형 — 순수수료 칸에 셀러 마진(견적가 − 공급가 − KOL RS)을 입력" : "환불·차지백 등 사후 조정은 순수수료를 음수로 입력"}
          </span>
        </h3>
        <button
          onClick={() => {
            setEditingSettlement(null);
            setSettlementForm(EMPTY_SETTLEMENT);
          }}
          className="btn-secondary btn-sm"
        >
          + 정산 추가
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">정산서일</th>
              <th className="table-header text-right">주문금액</th>
              <th className="table-header text-right">조정(차감)</th>
              <th className="table-header text-right">밴더 순수수료</th>
              <th className="table-header text-right">입금액</th>
              <th className="table-header">입금일</th>
              <th className="table-header">지급월</th>
              <th className="table-header">메모</th>
              <th className="table-header" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {settlements.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400 text-sm">
                  아직 정산 기록이 없습니다.
                </td>
              </tr>
            ) : (
              settlements.map((s) => {
                const pm = payMonthFor(campaign.end_date, s.deposited_on);
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="table-cell text-xs text-gray-500">{s.statement_date ? formatDate(s.statement_date) : "-"}</td>
                    <td className="table-cell text-right tabular-nums text-gray-600">{won(s.order_amount)}</td>
                    <td className="table-cell text-right tabular-nums text-gray-600" title={s.adjustment_note ?? undefined}>
                      {won(s.adjustment_amount)}
                    </td>
                    <td className={`table-cell text-right tabular-nums font-semibold ${s.vendor_fee < 0 ? "text-red-600" : "text-gray-900"}`}>
                      {formatWon(s.vendor_fee)}
                    </td>
                    <td className="table-cell text-right tabular-nums text-gray-600">{won(s.deposit_amount)}</td>
                    <td className="table-cell text-xs">
                      {s.deposited_on ? (
                        formatDate(s.deposited_on)
                      ) : (
                        <span className="badge bg-amber-50 text-amber-700">미수</span>
                      )}
                    </td>
                    <td className="table-cell text-xs text-gray-600 whitespace-nowrap">{pm ? payDayLabel(pm) : "-"}</td>
                    <td className="table-cell text-xs text-gray-500 max-w-[12rem] truncate" title={s.memo ?? undefined}>
                      {s.memo ?? ""}
                    </td>
                    <td className="table-cell text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditingSettlement(s.id);
                          setSettlementForm({
                            statement_date: s.statement_date ?? "",
                            order_amount: s.order_amount?.toString() ?? "",
                            adjustment_amount: s.adjustment_amount?.toString() ?? "",
                            adjustment_note: s.adjustment_note ?? "",
                            vendor_fee: s.vendor_fee.toString(),
                            deposit_amount: s.deposit_amount?.toString() ?? "",
                            deposited_on: s.deposited_on ?? "",
                            memo: s.memo ?? "",
                          });
                        }}
                        className="text-xs text-gray-500 hover:text-primary-600 mr-3"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ kind: "settlement", row: s })}
                        className="text-xs text-gray-400 hover:text-red-500"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 직접 실비 */}
      <div className="px-5 pt-5 pb-2 flex items-center justify-between border-t border-gray-100 mt-2">
        <h3 className="text-sm font-semibold text-gray-800">
          직접 실비
          <span className="text-xs font-normal text-gray-400 ml-2">
            이 공구가 없었다면 생기지 않았을 비용만 · 급여·임대료·구독료 등 고정비 제외
          </span>
        </h3>
        <button
          onClick={() => {
            setEditingExpense(null);
            setExpenseForm(EMPTY_EXPENSE);
          }}
          className="btn-secondary btn-sm"
        >
          + 실비 추가
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">항목</th>
              <th className="table-header text-right">금액 (VAT 제외)</th>
              <th className="table-header">날짜</th>
              <th className="table-header">내용</th>
              <th className="table-header">증빙</th>
              <th className="table-header" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                  등록된 직접 실비가 없습니다.
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <span className="badge bg-rose-50 text-rose-700">{EXPENSE_LABEL[e.category] ?? e.category}</span>
                  </td>
                  <td className="table-cell text-right tabular-nums font-semibold text-gray-900">{formatWon(e.amount)}</td>
                  <td className="table-cell text-xs text-gray-500">{e.spent_on ? formatDate(e.spent_on) : "-"}</td>
                  <td className="table-cell text-xs text-gray-600 max-w-[16rem] truncate" title={e.description ?? undefined}>
                    {e.description ?? ""}
                  </td>
                  <td className="table-cell text-xs">
                    {e.evidence_url ? (
                      <a href={e.evidence_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                        열기
                      </a>
                    ) : (
                      <span className="text-amber-600">없음</span>
                    )}
                  </td>
                  <td className="table-cell text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditingExpense(e.id);
                        setExpenseForm({
                          category: e.category,
                          amount: e.amount.toString(),
                          spent_on: e.spent_on ?? "",
                          description: e.description ?? "",
                          evidence_url: e.evidence_url ?? "",
                        });
                      }}
                      className="text-xs text-gray-500 hover:text-primary-600 mr-3"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ kind: "expense", row: e })}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 유가시딩 — 계산 제외, 기록만 */}
      <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3 flex-wrap bg-gray-50 rounded-b-xl">
        <label className="text-sm text-gray-700 flex items-center">
          유가시딩 (광고주 수취 KOL 예산)
          <HelpTip
            align="left"
            text="광고주에게 KOL 비용을 따로 받은 경우 그 금액입니다. 공구 4%·6% 계산에는 넣지 않고 KOL 인센티브 요율표로 별도 정산합니다(중복 지급 방지). 회사가 KOL 비용을 부담한 무가시딩은 직접 실비의 '무가시딩 비용'으로 넣으세요."
          />
        </label>
        <input
          value={seeding}
          onChange={(e) => setSeeding(e.target.value)}
          onBlur={saveSeeding}
          inputMode="numeric"
          placeholder="없으면 비워두기"
          className="input w-44 py-1.5 text-sm"
        />
        <span className="text-xs text-gray-400">공구 인센티브 계산 제외</span>
      </div>

      {/* 정산 입력 */}
      {settlementForm && (
        <FormModal
          title={editingSettlement ? "정산 기록 수정" : "정산 기록 추가"}
          saving={saving}
          onClose={() => setSettlementForm(null)}
          onSave={saveSettlement}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="정산서 기준일">
              <input type="date" className="input" value={settlementForm.statement_date}
                onChange={(e) => setSettlementForm({ ...settlementForm, statement_date: e.target.value })} />
            </Field>
            <Field label="공동구매 주문금액" hint="참고용">
              <input inputMode="numeric" className="input" value={settlementForm.order_amount}
                onChange={(e) => setSettlementForm({ ...settlementForm, order_amount: e.target.value })} />
            </Field>
            <Field label="취소·환불·반품·차지백 조정" hint="참고용 · 차감액">
              <input inputMode="numeric" className="input" value={settlementForm.adjustment_amount}
                onChange={(e) => setSettlementForm({ ...settlementForm, adjustment_amount: e.target.value })} />
            </Field>
            <Field label="조정 내용">
              <input className="input" placeholder="예: 부분환불 3건" value={settlementForm.adjustment_note}
                onChange={(e) => setSettlementForm({ ...settlementForm, adjustment_note: e.target.value })} />
            </Field>
            <div className="col-span-2">
              <Field
                label={isSupply ? "셀러 마진 (VAT 제외) *" : "밴더 순수수료 (VAT 제외) *"}
                hint="인센티브 기준. 조정 반영 후 회사에 귀속되는 금액. 사후 환불은 음수"
              >
                <input inputMode="numeric" className="input text-base font-semibold" value={settlementForm.vendor_fee}
                  onChange={(e) => setSettlementForm({ ...settlementForm, vendor_fee: e.target.value })} />
              </Field>
            </div>
            <Field label="실제 입금액" hint="외화는 실제 받은 원화">
              <input inputMode="numeric" className="input" value={settlementForm.deposit_amount}
                onChange={(e) => setSettlementForm({ ...settlementForm, deposit_amount: e.target.value })} />
            </Field>
            <Field label="입금일" hint="비우면 미수 → 계산 제외">
              <input type="date" className="input" value={settlementForm.deposited_on}
                onChange={(e) => setSettlementForm({ ...settlementForm, deposited_on: e.target.value })} />
            </Field>
            <div className="col-span-2">
              <Field label="메모">
                <input className="input" value={settlementForm.memo}
                  onChange={(e) => setSettlementForm({ ...settlementForm, memo: e.target.value })} />
              </Field>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            부분입금은 입금된 만큼의 수수료만 한 줄로 넣고, 나머지는 입금된 뒤 새 줄로 추가하세요.
            송금·환전 비용은 직접 실비의 &apos;송금·통관 비용&apos;으로 넣습니다.
          </p>
        </FormModal>
      )}

      {/* 실비 입력 */}
      {expenseForm && (
        <FormModal
          title={editingExpense ? "직접 실비 수정" : "직접 실비 추가"}
          saving={saving}
          onClose={() => setExpenseForm(null)}
          onSave={saveExpense}
        >
          <div className="space-y-3">
            <Field label="항목 *" hint={EXPENSE_CATEGORIES.find((c) => c.key === expenseForm.category)?.hint}>
              <select className="input" value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="금액 (VAT 제외) *">
                <input inputMode="numeric" className="input" value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
              </Field>
              <Field label="날짜">
                <input type="date" className="input" value={expenseForm.spent_on}
                  onChange={(e) => setExpenseForm({ ...expenseForm, spent_on: e.target.value })} />
              </Field>
            </div>
            <Field label="내용">
              <input className="input" placeholder="예: Meta 광고 9/1~9/14" value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
            </Field>
            <Field label="증빙 링크" hint="영수증·세금계산서 드라이브 링크">
              <input className="input" placeholder="https://" value={expenseForm.evidence_url}
                onChange={(e) => setExpenseForm({ ...expenseForm, evidence_url: e.target.value })} />
            </Field>
          </div>
        </FormModal>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "settlement" ? "정산 기록 삭제" : "직접 실비 삭제"}
        danger
        description="인센티브 계산이 바뀝니다. 이미 확정된 명세가 있으면 다음 명세표에서 차액이 조정됩니다. 삭제 내역은 활동 로그에 남습니다."
        confirmLabel="삭제"
        loading={saving}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function FormModal({
  title,
  saving,
  onClose,
  onSave,
  children,
}: {
  title: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>
        <form
          className="p-6 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          {children}
          <div className="flex justify-end gap-3 pt-5">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
              취소
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
