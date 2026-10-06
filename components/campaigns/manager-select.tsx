"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Manager } from "@/types/database";
import {
  assignableManagers,
  isActiveManager,
  roleOf,
  ROLE_LABEL,
} from "@/lib/managers";
import { assignCampaigns, assignErrorMessage } from "@/lib/campaign-assign";

interface ManagerSelectProps {
  campaign: { id: string; campaign_name: string; manager_id?: string | null };
  managers: Manager[];
  size?: "sm" | "md";
}

/**
 * 캠페인 담당자 인라인 변경 — StageSelect와 같은 방식으로 목록·상세에서 바로 바꾼다.
 * 관리 담당자를 위에, 영업 담당자를 아래에 묶어 보여준다.
 */
export default function ManagerSelect({ campaign, managers, size = "sm" }: ManagerSelectProps) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<string>(campaign.manager_id ?? "");
  const [saving, setSaving] = useState(false);

  // 일괄 배정 후 router.refresh()로 새 값이 내려오면 따라간다
  useEffect(() => {
    setValue(campaign.manager_id ?? "");
  }, [campaign.manager_id]);

  const options = assignableManagers(managers, campaign.manager_id);
  const ops = options.filter((m) => roleOf(m) === "ops");
  const sales = options.filter((m) => roleOf(m) === "sales");
  const current = managers.find((m) => m.id === value);

  const handleChange = async (next: string) => {
    const prev = value;
    setValue(next);
    setSaving(true);
    try {
      const { logged } = await assignCampaigns({
        targets: [campaign],
        managerId: next || null,
        managers,
      });
      const name = managers.find((m) => m.id === next)?.name;
      toast.success(name ? `담당자를 ${name}님으로 배정했습니다.` : "담당자 배정을 해제했습니다.");
      if (!logged) toast.info("배정은 저장됐지만 활동 로그 기록에 실패했습니다.");
      router.refresh();
    } catch (e) {
      setValue(prev);
      toast.error(assignErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const optionLabel = (m: Manager) => (isActiveManager(m) ? m.name : `${m.name} (퇴사)`);

  return (
    <select
      value={value}
      disabled={saving}
      title={
        current
          ? `${ROLE_LABEL[roleOf(current)]} 담당자 ${current.name} (눌러서 변경)`
          : "담당자 미배정 (눌러서 배정)"
      }
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        handleChange(e.target.value);
      }}
      className={`rounded-full font-medium border-0 cursor-pointer focus:ring-2 focus:ring-primary-500 disabled:opacity-50 ${
        size === "sm" ? "text-xs pl-2.5 pr-6 py-0.5" : "text-sm pl-3 pr-7 py-1"
      } ${
        !current
          ? "bg-amber-50 text-amber-700"
          : !isActiveManager(current)
          ? "bg-red-50 text-red-600"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      <option value="" className="bg-white text-gray-900">
        미배정
      </option>
      {ops.length > 0 && (
        <optgroup label="관리 담당자" className="bg-white text-gray-900">
          {ops.map((m) => (
            <option key={m.id} value={m.id}>
              {optionLabel(m)}
            </option>
          ))}
        </optgroup>
      )}
      {sales.length > 0 && (
        <optgroup label="영업 담당자" className="bg-white text-gray-900">
          {sales.map((m) => (
            <option key={m.id} value={m.id}>
              {optionLabel(m)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
