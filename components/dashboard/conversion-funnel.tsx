import Link from "next/link";

/**
 * 거래처 전환 퍼널 — 컨택한 업체 중 실제로 공구를 연 곳이 몇 %인지.
 *
 * 단계는 반드시 상위 단계의 부분집합이어야 한다(누적 퍼널). 그래야 막대 길이가
 * 줄어드는 것으로 읽히고 단계별 전환율이 의미를 갖는다. 컨택 상태(발송완료·
 * 입점완료…)는 이 축과 별개라 섞지 않는다 — 부분집합이 아니라서 퍼널이 깨진다.
 *
 * 색: 순차형 단일 색조(진해질수록 깊은 단계). 3단계 모두 표면 대비 3:1 이상.
 */

export interface FunnelStage {
  label: string;
  count: number;
  /** 이 단계가 무엇인지 — 툴팁으로 노출 */
  hint: string;
}

interface ConversionFunnelProps {
  stages: FunnelStage[];
  href?: string;
}

/** 순차형 램프 — 명도 단조 감소, 흰 배경 대비 3:1 이상 (validate_palette 통과) */
const RAMP = ["#3b82f6", "#1d4ed8", "#1e3a8a"];

export default function ConversionFunnel({
  stages,
  href = "/prospects",
}: ConversionFunnelProps) {
  const base = stages[0]?.count ?? 0;
  const final = stages[stages.length - 1]?.count ?? 0;
  const overallRate = base > 0 ? (final / base) * 100 : null;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">거래처 전환율</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            컨택한 업체 중 실제로 공구를 연 비율
          </p>
        </div>
        <Link
          href={href}
          className="text-xs text-primary-600 hover:underline whitespace-nowrap shrink-0"
        >
          거래처 관리 →
        </Link>
      </div>

      {base === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          등록된 거래처가 없습니다.
        </p>
      ) : (
        <>
          {/* 히어로 수치 — 대시보드가 이 카드에서 먼저 읽히길 원하는 숫자 */}
          <div className="flex items-baseline gap-2 mb-5">
            <span className="text-5xl font-bold tracking-tight text-gray-900">
              {overallRate!.toFixed(1)}
              <span className="text-2xl font-semibold text-gray-400 ml-0.5">%</span>
            </span>
            <span className="text-xs text-gray-400">
              거래처 {base.toLocaleString("ko-KR")}곳 중 {final.toLocaleString("ko-KR")}곳
            </span>
          </div>

          {/* 누적 퍼널 — 막대 길이는 1단계 대비 비율 */}
          <div className="space-y-3">
            {stages.map((stage, i) => {
              const pct = base > 0 ? (stage.count / base) * 100 : 0;
              const prev = i > 0 ? stages[i - 1].count : null;
              const stepRate =
                prev && prev > 0 ? (stage.count / prev) * 100 : null;

              return (
                <div key={stage.label}>
                  {/* 단계 사이 전환율 */}
                  {stepRate !== null && (
                    <p className="text-[11px] text-gray-400 mb-1.5 pl-1">
                      ↳ 이전 단계 대비{" "}
                      <span className="font-semibold text-gray-600">
                        {stepRate.toFixed(1)}%
                      </span>
                      {prev !== null && stage.count < prev && (
                        <span className="text-gray-300">
                          {" "}
                          ({(prev - stage.count).toLocaleString("ko-KR")}곳 이탈)
                        </span>
                      )}
                    </p>
                  )}

                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-gray-600 text-right">
                      {stage.label}
                    </span>

                    {/*
                      막대 트랙과 값을 별도 컬럼으로 둔다. 한 줄에 같이 흘리면
                      1단계(항상 100%)에서 값이 밀려 잘린다.
                      막대는 기준선(왼쪽) 각지고 데이터 끝만 4px 라운드.
                    */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="h-6 rounded-r"
                        style={{
                          width: `${Math.max(pct, 1.5)}%`,
                          backgroundColor: RAMP[Math.min(i, RAMP.length - 1)],
                        }}
                        title={`${stage.label} · ${stage.hint}`}
                      />
                    </div>

                    <span className="w-24 shrink-0 text-right text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                      {stage.count.toLocaleString("ko-KR")}
                      <span className="text-xs font-normal text-gray-400 ml-1">
                        {pct.toFixed(0)}%
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 표 대체 경로 — 색·막대에만 기대지 않도록 단계 정의를 글로도 남긴다 */}
          <dl className="mt-5 pt-4 border-t border-gray-100 space-y-1">
            {stages.map((s) => (
              <div key={s.label} className="flex gap-2 text-[11px]">
                <dt className="w-20 shrink-0 text-right text-gray-500">
                  {s.label}
                </dt>
                <dd className="text-gray-400">{s.hint}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
