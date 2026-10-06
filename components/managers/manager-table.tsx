"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Manager, ManagerRole } from "@/types/database";
import ManagerModal from "./manager-modal";
import HandoverModal from "./handover-modal";
import { logDeletion } from "@/lib/activity-log";
import { resolveStage, CampaignStage } from "@/lib/campaign-stage";
import { useToast } from "@/components/ui/toast";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
  HANDOVER_DEFAULT_STAGES,
  isActiveManager,
  managerWriteErrorMessage,
  PERMISSION_DENIED,
  roleOf,
  ROLE_COLOR,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
} from "@/lib/managers";

/** 담당 집계·인수인계용 캠페인 요약 */
export interface ManagerCampaign {
  id: string;
  campaign_name: string;
  client_name: string;
  status: CampaignStage | null;
  start_date: string | null;
  end_date: string | null;
  manager_id: string | null;
}

export interface ManagerProspect {
  id: string;
  company_name: string;
  manager_id: string | null;
}

interface ManagerTableProps {
  managers: Manager[];
  campaigns: ManagerCampaign[];
  prospects: ManagerProspect[];
  /** 최종 관리자만 추가·수정·퇴사·삭제·인수인계 가능 */
  canManage: boolean;
}

type Tab = "all" | ManagerRole | "retired";

export default function ManagerTable({
  managers,
  campaigns,
  prospects,
  canManage,
}: ManagerTableProps) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Manager | undefined>(undefined);
  const [handoverTarget, setHandoverTarget] = useState<Manager | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Manager | null>(null);
  const [retireTarget, setRetireTarget] = useState<Manager | null>(null);
  const [working, setWorking] = useState(false);

  const campaignsOf = (id: string) => campaigns.filter((c) => c.manager_id === id);
  const activeCampaignsOf = (id: string) =>
    campaignsOf(id).filter((c) => HANDOVER_DEFAULT_STAGES.includes(resolveStage(c)));
  const prospectsOf = (id: string) => prospects.filter((p) => p.manager_id === id);

  const active = managers.filter(isActiveManager);
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "재직 중 전체", count: active.length },
    { key: "ops", label: "관리 담당자", count: active.filter((m) => roleOf(m) === "ops").length },
    { key: "sales", label: "영업 담당자", count: active.filter((m) => roleOf(m) === "sales").length },
    { key: "retired", label: "퇴사자", count: managers.length - active.length },
  ];

  const visible = managers
    .filter((m) =>
      tab === "retired"
        ? !isActiveManager(m)
        : isActiveManager(m) && (tab === "all" || roleOf(m) === tab)
    )
    // 관리 담당자 먼저, 그다음 이름순
    .sort((a, b) =>
      roleOf(a) !== roleOf(b)
        ? roleOf(a) === "ops"
          ? -1
          : 1
        : a.name.localeCompare(b.name, "ko")
    );

  const refresh = () => router.refresh();

  const handleSaved = () => {
    setModalOpen(false);
    setEditTarget(undefined);
    refresh();
  };

  const handleRestore = async (m: Manager) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("managers")
        .update({ is_active: true })
        .eq("id", m.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error(PERMISSION_DENIED);
      toast.success(`${m.name}님을 재직 상태로 되돌렸습니다.`);
      refresh();
    } catch (e) {
      toast.error(managerWriteErrorMessage(e));
    }
  };

  const handleRetire = async () => {
    if (!retireTarget) return;
    setWorking(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("managers")
        .update({ is_active: false })
        .eq("id", retireTarget.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error(PERMISSION_DENIED);
      toast.success(`${retireTarget.name}님을 퇴사 처리했습니다.`);
      setRetireTarget(null);
      refresh();
    } catch (e) {
      toast.error(managerWriteErrorMessage(e));
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const supabase = createClient();
      await logDeletion({
        entityType: "manager",
        entityId: deleteTarget.id,
        entityLabel: deleteTarget.name,
        context: deleteTarget.email ?? null,
        snapshot: deleteTarget,
      });
      const { data, error } = await supabase
        .from("managers")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error(PERMISSION_DENIED);
      toast.success(`${deleteTarget.name}님을 삭제했습니다.`);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      toast.error(managerWriteErrorMessage(e));
    } finally {
      setWorking(false);
    }
  };

  const deleteCampaignCount = deleteTarget ? campaignsOf(deleteTarget.id).length : 0;
  const deleteProspectCount = deleteTarget ? prospectsOf(deleteTarget.id).length : 0;
  const retireLeft = retireTarget ? activeCampaignsOf(retireTarget.id).length : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`btn btn-sm flex items-center gap-1.5 ${
                tab === t.key ? "btn-primary" : "btn-secondary"
              }`}
            >
              {t.label}
              <span
                className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                  tab === t.key ? "bg-white/30 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        {canManage ? (
          <button
            onClick={() => {
              setEditTarget(undefined);
              setModalOpen(true);
            }}
            className="btn-primary"
          >
            + 담당자 등록
          </button>
        ) : (
          <p className="text-xs text-gray-400">
            담당자 명단은 최종 관리자만 수정할 수 있습니다.
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">구분</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">이름</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">이메일</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">전화번호</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">담당 캠페인</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">담당 거래처</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {tab === "retired" ? "퇴사 처리된 담당자가 없습니다." : "등록된 담당자가 없습니다."}
                  </td>
                </tr>
              ) : (
                visible.map((m) => {
                  const role = roleOf(m);
                  const activeCount = activeCampaignsOf(m.id).length;
                  const totalCount = campaignsOf(m.id).length;
                  const prospectCount = prospectsOf(m.id).length;
                  const retired = !isActiveManager(m);
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`badge ${ROLE_COLOR[role]}`} title={ROLE_DESCRIPTION[role]}>
                          {ROLE_LABEL[role]}
                        </span>
                        {retired && <span className="badge bg-red-50 text-red-500 ml-1">퇴사</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                      <td className="px-4 py-3 text-gray-600">{m.email ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{m.phone ?? "-"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {totalCount === 0 ? (
                          <span className="text-gray-300">-</span>
                        ) : (
                          <span className={retired && activeCount > 0 ? "text-red-600 font-medium" : "text-gray-700"}>
                            진행 {activeCount}
                            <span className="text-gray-400 text-xs"> / 전체 {totalCount}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {prospectCount === 0 ? (
                          <span className="text-gray-300">-</span>
                        ) : (
                          <span className={retired ? "text-red-600 font-medium" : "text-gray-700"}>
                            {prospectCount}곳
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canManage && (
                          <div className="flex gap-3 justify-end whitespace-nowrap">
                            {(totalCount > 0 || prospectCount > 0) && (
                              <button
                                onClick={() => setHandoverTarget(m)}
                                className="text-xs font-medium text-primary-600 hover:text-primary-700"
                              >
                                인수인계
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setEditTarget(m);
                                setModalOpen(true);
                              }}
                              className="text-xs text-gray-500 hover:text-primary-600 transition-colors"
                            >
                              수정
                            </button>
                            {retired ? (
                              <button
                                onClick={() => handleRestore(m)}
                                className="text-xs text-gray-500 hover:text-emerald-600 transition-colors"
                              >
                                복직
                              </button>
                            ) : (
                              <button
                                onClick={() => setRetireTarget(m)}
                                className="text-xs text-gray-500 hover:text-orange-600 transition-colors"
                              >
                                퇴사 처리
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteTarget(m)}
                              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {visible.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            총 {visible.length}명
          </div>
        )}
      </div>

      {modalOpen && (
        <ManagerModal
          manager={editTarget}
          onClose={() => {
            setModalOpen(false);
            setEditTarget(undefined);
          }}
          onSaved={handleSaved}
        />
      )}

      {handoverTarget && (
        <HandoverModal
          from={handoverTarget}
          managers={managers}
          campaigns={campaignsOf(handoverTarget.id)}
          prospects={prospectsOf(handoverTarget.id)}
          onClose={() => setHandoverTarget(null)}
          onDone={() => {
            setHandoverTarget(null);
            refresh();
          }}
        />
      )}

      {/* 퇴사 처리 — 진행 중 캠페인이 남아 있으면 인수인계를 먼저 권한다 */}
      <ConfirmDialog
        open={retireTarget !== null}
        title="퇴사 처리"
        description={
          <>
            <b className="text-gray-800">{retireTarget?.name}</b>님을 퇴사 처리하면 새 캠페인·거래처에
            배정할 수 없게 됩니다. 기존 담당 기록은 그대로 남습니다.
            {retireLeft > 0 && (
              <>
                <br />
                <b className="text-red-600">
                  아직 진행 중인 캠페인 {retireLeft}건이 남아 있습니다.
                </b>{" "}
                취소 후 &apos;인수인계&apos;로 먼저 넘기는 것을 권장합니다.
              </>
            )}
          </>
        }
        confirmLabel="퇴사 처리"
        danger
        loading={working}
        onConfirm={handleRetire}
        onClose={() => setRetireTarget(null)}
      />

      {/* 삭제 — 퇴사는 '퇴사 처리'가 기본, 삭제는 잘못 등록한 경우용 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="담당자 삭제"
        danger
        description={
          <>
            잘못 등록한 담당자를 지울 때만 사용하세요. 퇴사자는 &apos;퇴사 처리&apos;를 쓰면 담당
            이력이 보존됩니다.
            {(deleteCampaignCount > 0 || deleteProspectCount > 0) && (
              <>
                <br />
                <b className="text-red-600">
                  삭제하면 캠페인 {deleteCampaignCount}건·거래처 {deleteProspectCount}곳이 미배정이
                  됩니다.
                </b>
              </>
            )}
            <br />
            삭제 내역은 활동 로그에 원본과 함께 남습니다.
          </>
        }
        confirmLabel="삭제"
        requireText={deleteCampaignCount > 0 || deleteProspectCount > 0 ? deleteTarget?.name : undefined}
        loading={working}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
