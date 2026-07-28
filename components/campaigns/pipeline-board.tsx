"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import {
  CampaignStage,
  PIPELINE_STAGES,
  STAGE_DESCRIPTION,
  STAGE_DOT,
  STAGE_LABEL,
} from "@/lib/campaign-stage";
import { formatDate, formatMoney, withRo } from "@/lib/utils";
import StageSelect from "@/components/campaigns/stage-select";

export interface PipelineCampaign {
  id: string;
  campaign_name: string;
  client_name: string;
  stage: CampaignStage;
  start_date: string | null;
  end_date: string | null;
  gonggu_price: number | null;
  target_sales: number | null;
  exchange_rate: number | null;
  deal_type: string | null;
  created_at: string;
}

interface PipelineBoardProps {
  campaigns: PipelineCampaign[];
}

/** 다음 단계로 한 번에 밀어주는 버튼용 — 마지막 대기 단계는 "진행중"으로 */
const NEXT_STAGE: Record<string, CampaignStage> = {
  lead: "setup",
  setup: "recruiting",
  recruiting: "live",
};

export default function PipelineBoard({ campaigns }: PipelineBoardProps) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);

  const filtered = campaigns.filter(
    (c) =>
      c.campaign_name.toLowerCase().includes(search.toLowerCase()) ||
      c.client_name.toLowerCase().includes(search.toLowerCase())
  );

  const advance = async (c: PipelineCampaign) => {
    const next = NEXT_STAGE[c.stage];
    if (!next) return;
    setMovingId(c.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("campaigns")
        .update({ status: next })
        .eq("id", c.id);
      if (error) throw error;
      toast.success(
        next === "live"
          ? `"${c.campaign_name}"이(가) 진행중으로 전환되었습니다.`
          : `"${c.campaign_name}" → ${STAGE_LABEL[next]}`
      );
      router.refresh();
    } catch {
      toast.error("단계 변경 중 오류가 발생했습니다.");
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="캠페인명 또는 클라이언트명 검색"
            className="input pl-9"
          />
        </div>
        <Link href="/campaigns/new" className="btn-primary whitespace-nowrap">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          신규 캠페인 등록
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PIPELINE_STAGES.map((stage) => {
          const items = filtered.filter((c) => c.stage === stage);
          return (
            <div key={stage} className="flex flex-col">
              {/* 컬럼 헤더 */}
              <div className="flex items-center gap-2 px-1 pb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${STAGE_DOT[stage]}`} />
                <h3 className="text-sm font-semibold text-gray-900">
                  {STAGE_LABEL[stage]}
                </h3>
                <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">
                  {items.length}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 px-1 pb-2">
                {STAGE_DESCRIPTION[stage]}
              </p>

              {/* 카드 목록 */}
              <div className="flex-1 space-y-2.5 bg-gray-100/60 rounded-xl p-2.5 min-h-[160px]">
                {items.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8">
                    해당 단계의 캠페인이 없습니다.
                  </p>
                ) : (
                  items.map((c) => (
                    <div
                      key={c.id}
                      className="card p-3.5 space-y-2 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="flex-1 min-w-0 group"
                        >
                          <p className="font-semibold text-sm text-gray-900 truncate group-hover:text-primary-600 transition-colors">
                            {c.campaign_name}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {c.client_name}
                          </p>
                        </Link>
                        <StageSelect campaignId={c.id} stage={c.stage} />
                      </div>

                      <dl className="text-[11px] text-gray-500 space-y-0.5">
                        <div className="flex justify-between gap-2">
                          <dt>공구 기간</dt>
                          <dd className="text-gray-700 truncate">
                            {c.start_date || c.end_date
                              ? `${formatDate(c.start_date)} ~ ${formatDate(c.end_date)}`
                              : "미정"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>공구가</dt>
                          <dd className="text-gray-700 truncate">
                            {c.gonggu_price
                              ? formatMoney(c.gonggu_price, c.exchange_rate)
                              : "-"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>목표</dt>
                          <dd className="text-gray-700 truncate">
                            {c.target_sales
                              ? formatMoney(c.target_sales, c.exchange_rate)
                              : "-"}
                          </dd>
                        </div>
                      </dl>

                      <div className="flex items-center gap-2 pt-1">
                        <Link
                          href={`/campaigns/${c.id}/edit`}
                          className="btn-secondary btn-sm flex-1 text-center"
                        >
                          수정
                        </Link>
                        <button
                          onClick={() => advance(c)}
                          disabled={movingId === c.id}
                          className="btn-primary btn-sm flex-1"
                        >
                          {movingId === c.id
                            ? "이동 중..."
                            : `${withRo(STAGE_LABEL[NEXT_STAGE[c.stage]])} →`}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 px-1">
        총 {filtered.length}개 대기 캠페인
        {search && ` (전체 ${campaigns.length}개 중)`}
      </p>
    </div>
  );
}
