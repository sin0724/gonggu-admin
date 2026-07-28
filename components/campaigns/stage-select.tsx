"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import {
  CAMPAIGN_STAGES,
  CampaignStage,
  STAGE_COLOR,
  STAGE_LABEL,
} from "@/lib/campaign-stage";

interface StageSelectProps {
  campaignId: string;
  stage: CampaignStage;
  /** 배지처럼 보이는 인라인 셀렉트 (목록/카드용) */
  size?: "sm" | "md";
  className?: string;
}

/**
 * 캠페인 단계 인라인 변경 — 목록·보드에서 상세로 들어가지 않고 바꾼다.
 * 저장 후 router.refresh()로 서버 컴포넌트를 다시 그려 집계까지 맞춘다.
 */
export default function StageSelect({
  campaignId,
  stage,
  size = "sm",
  className = "",
}: StageSelectProps) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<CampaignStage>(stage);
  const [saving, setSaving] = useState(false);

  const handleChange = async (next: CampaignStage) => {
    const prev = value;
    setValue(next);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("campaigns")
        .update({ status: next })
        .eq("id", campaignId);
      if (error) throw error;
      toast.success(`단계를 "${STAGE_LABEL[next]}"(으)로 변경했습니다.`);
      router.refresh();
    } catch {
      setValue(prev);
      toast.error("단계 변경 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={value}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        handleChange(e.target.value as CampaignStage);
      }}
      className={`rounded-full font-medium border-0 cursor-pointer focus:ring-2 focus:ring-primary-500 disabled:opacity-50 ${
        size === "sm" ? "text-xs pl-2.5 pr-6 py-0.5" : "text-sm pl-3 pr-7 py-1"
      } ${STAGE_COLOR[value]} ${className}`}
    >
      {CAMPAIGN_STAGES.map((s) => (
        <option key={s} value={s} className="bg-white text-gray-900">
          {STAGE_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
