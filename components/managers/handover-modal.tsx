"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Manager } from "@/types/database";
import { useToast } from "@/components/ui/toast";
import { resolveStage, STAGE_COLOR, STAGE_LABEL } from "@/lib/campaign-stage";
import {
  assignableManagers,
  HANDOVER_DEFAULT_STAGES,
  isActiveManager,
  managerWriteErrorMessage,
  PERMISSION_DENIED,
  roleOf,
  ROLE_LABEL,
} from "@/lib/managers";
import { assignCampaigns, assignErrorMessage } from "@/lib/campaign-assign";
import type { ManagerCampaign, ManagerProspect } from "./manager-table";

interface HandoverModalProps {
  from: Manager;
  managers: Manager[];
  /** from이 맡고 있는 캠페인 */
  campaigns: ManagerCampaign[];
  /** from이 맡고 있는 거래처 */
  prospects: ManagerProspect[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * 인수인계 — 한 담당자가 맡던 캠페인·거래처를 다른 담당자에게 한 번에 넘긴다.
 * 진행 중인 캠페인은 기본 선택, 종료·보류 건은 기록 보존을 위해 기본 해제.
 * 넘긴 내역은 활동 로그에 "누구 → 누구"로 남는다.
 */
export default function HandoverModal({
  from,
  managers,
  campaigns,
  prospects,
  onClose,
  onDone,
}: HandoverModalProps) {
  const toast = useToast();
  const candidates = assignableManagers(managers).filter((m) => m.id !== from.id);
  // 같은 구분(관리→관리, 영업→영업)의 첫 사람을 기본 후보로
  const [toId, setToId] = useState<string>(
    candidates.find((m) => roleOf(m) === roleOf(from))?.id ?? candidates[0]?.id ?? ""
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(
      campaigns
        .filter((c) => HANDOVER_DEFAULT_STAGES.includes(resolveStage(c)))
        .map((c) => c.id)
    )
  );
  const [withProspects, setWithProspects] = useState(prospects.length > 0);
  const [retire, setRetire] = useState(isActiveManager(from));
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !working) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, working]);

  const to = managers.find((m) => m.id === toId);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const nothingToDo = selected.size === 0 && !(withProspects && prospects.length > 0) && !retire;

  const handleSubmit = async () => {
    if (!to && (selected.size > 0 || withProspects)) return;
    setWorking(true);
    const done: string[] = [];
    try {
      const supabase = createClient();

      if (selected.size > 0 && to) {
        const targets = campaigns.filter((c) => selected.has(c.id));
        const { logged } = await assignCampaigns({
          targets,
          managerId: to.id,
          managers,
          reason: `인수인계 ${from.name} → ${to.name} (캠페인 ${targets.length}건)`,
        });
        done.push(`캠페인 ${targets.length}건`);
        if (!logged) toast.info("캠페인은 넘어갔지만 활동 로그 기록에 실패했습니다.");
      }

      if (withProspects && prospects.length > 0 && to) {
        const { error } = await supabase
          .from("prospects")
          .update({ manager_id: to.id })
          .in(
            "id",
            prospects.map((p) => p.id)
          );
        if (error) throw error;
        done.push(`거래처 ${prospects.length}곳`);
      }

      if (retire) {
        const { data, error } = await supabase
          .from("managers")
          .update({ is_active: false })
          .eq("id", from.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error(PERMISSION_DENIED);
      }

      toast.success(
        [
          done.length > 0 && to ? `${done.join("·")}를 ${to.name}님에게 넘겼습니다.` : null,
          retire ? `${from.name}님은 퇴사 처리했습니다.` : null,
        ]
          .filter(Boolean)
          .join(" ")
      );
      onDone();
    } catch (e) {
      const msg = (e as Error)?.message === PERMISSION_DENIED
        ? managerWriteErrorMessage(e)
        : assignErrorMessage(e);
      toast.error(done.length > 0 ? `${done.join("·")}는 넘어갔지만 이후 단계에서 실패: ${msg}` : msg);
      if (done.length > 0) onDone();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !working && onClose()} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            인수인계 — {from.name}
            <span className="text-sm font-normal text-gray-400 ml-1">
              ({ROLE_LABEL[roleOf(from)]})
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            맡던 캠페인과 거래처를 다른 담당자에게 넘깁니다. 넘긴 내역은 활동 로그에 남습니다.
          </p>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div>
            <label className="label">받는 사람</label>
            {candidates.length === 0 ? (
              <p className="text-sm text-red-600">
                넘겨받을 재직 중인 담당자가 없습니다. 먼저 담당자를 등록하세요.
              </p>
            ) : (
              <select value={toId} onChange={(e) => setToId(e.target.value)} className="input">
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({ROLE_LABEL[roleOf(m)]})
                  </option>
                ))}
              </select>
            )}
          </div>

          {campaigns.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">
                  넘길 캠페인 <span className="text-gray-400 font-normal">{selected.size}/{campaigns.length}</span>
                </label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(campaigns.map((c) => c.id)))}
                    className="text-primary-600 hover:underline"
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-gray-500 hover:underline"
                  >
                    전체 해제
                  </button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {campaigns.map((c) => {
                  const stage = resolveStage(c);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-gray-900 truncate">{c.campaign_name}</span>
                        <span className="block text-xs text-gray-400 truncate">{c.client_name}</span>
                      </span>
                      <span className={`badge ${STAGE_COLOR[stage]}`}>{STAGE_LABEL[stage]}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                종료·보류 캠페인은 기본으로 원래 담당자 기록을 남깁니다. 필요하면 체크해서 함께 넘기세요.
              </p>
            </div>
          )}

          {prospects.length > 0 && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={withProspects}
                onChange={(e) => setWithProspects(e.target.checked)}
                className="rounded border-gray-300 mt-0.5"
              />
              <span className="text-sm text-gray-700">
                담당 거래처 {prospects.length}곳도 함께 넘기기
                <span className="block text-xs text-gray-400">
                  {prospects.slice(0, 3).map((p) => p.company_name).join(", ")}
                  {prospects.length > 3 && ` 외 ${prospects.length - 3}곳`}
                </span>
              </span>
            </label>
          )}

          {isActiveManager(from) && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={retire}
                onChange={(e) => setRetire(e.target.checked)}
                className="rounded border-gray-300 mt-0.5"
              />
              <span className="text-sm text-gray-700">
                넘긴 뒤 {from.name}님을 퇴사 처리
                <span className="block text-xs text-gray-400">
                  부서 이동·업무 분담이라면 체크를 해제하세요.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} disabled={working} className="btn-secondary">
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={working || nothingToDo || (!to && (selected.size > 0 || withProspects))}
            className="btn-primary"
          >
            {working ? "넘기는 중..." : "인수인계 실행"}
          </button>
        </div>
      </div>
    </div>
  );
}
