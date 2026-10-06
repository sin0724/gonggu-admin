"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { assignErrorMessage } from "@/lib/campaign-assign";

interface AssignmentConfirmProps {
  campaignId: string;
  confirmedAt: string | null | undefined;
  confirmedBy: string | null | undefined;
  /** 최종 관리자만 확정·해제 가능 */
  canConfirm: boolean;
}

/**
 * 담당 확정 — 보상안 6항 "담당자 및 역할은 공구 진행 전 또는 초기에 사측에서 확정".
 * 확정 후에는 DB 트리거가 최종 관리자 외의 담당 변경을 막는다.
 */
export default function AssignmentConfirm({
  campaignId,
  confirmedAt,
  confirmedBy,
  canConfirm,
}: AssignmentConfirmProps) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("campaigns")
        .update(
          confirmedAt
            ? { assignment_confirmed_at: null, assignment_confirmed_by: null }
            : {
                assignment_confirmed_at: new Date().toISOString(),
                assignment_confirmed_by: data.user?.email ?? null,
              }
        )
        .eq("id", campaignId);
      if (error) throw error;
      toast.success(confirmedAt ? "담당 확정을 해제했습니다." : "담당을 확정했습니다.");
      router.refresh();
    } catch (e) {
      toast.error(assignErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (confirmedAt) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="badge bg-gray-900 text-white"
          title={`${formatDate(confirmedAt)} ${confirmedBy ?? ""} 확정 — 담당 변경은 최종 관리자만 가능`}
        >
          🔒 담당 확정
        </span>
        {canConfirm && (
          <button onClick={toggle} disabled={saving} className="text-xs text-gray-400 hover:text-gray-600">
            해제
          </button>
        )}
      </span>
    );
  }

  if (!canConfirm) return null;
  return (
    <button
      onClick={toggle}
      disabled={saving}
      className="text-xs font-medium text-primary-600 hover:text-primary-700"
      title="인센티브 귀속 담당자를 확정합니다. 확정 후에는 최종 관리자만 바꿀 수 있습니다."
    >
      담당 확정하기
    </button>
  );
}
