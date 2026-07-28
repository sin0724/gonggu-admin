"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { teamCalendarLink } from "@/lib/calendar";

interface FeedSubscribeProps {
  /** ICS 구독 주소. CALENDAR_FEED_TOKEN 미설정 시 null */
  feedUrl: string | null;
}

/**
 * 구글 캘린더 연동 안내 — ICS 구독 주소를 복사해 구글 캘린더에 붙이면
 * 이후 등록/수정한 일정이 자동으로 반영된다.
 */
export default function FeedSubscribe({ feedUrl }: FeedSubscribeProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const teamLink = teamCalendarLink();

  const copy = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success("구독 주소가 복사되었습니다.");
    } catch {
      toast.error("복사에 실패했습니다. 주소를 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <>
      {teamLink && (
        <a
          href={teamLink}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary btn-sm"
          title="팀 공용 구글 캘린더를 새 탭에서 엽니다"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          팀 캘린더 열기
        </a>
      )}

      <button onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        구글 캘린더 연동
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">구글 캘린더 연동</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-gray-700">
              {teamLink && (
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 space-y-2 text-xs">
                  <p className="font-semibold text-primary-800 text-sm">
                    팀 공용 캘린더가 연결되어 있습니다.
                  </p>
                  <p className="text-primary-700">
                    일정의 &quot;구글 캘린더에 추가&quot;를 누르면 개인 캘린더가 아니라
                    이 팀 캘린더에 저장됩니다. (구글 계정에 이 캘린더의 수정 권한이
                    있어야 합니다)
                  </p>
                  <a
                    href={teamLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary btn-sm"
                  >
                    팀 캘린더 열기
                  </a>
                </div>
              )}

              {feedUrl ? (
                <>
                  <p>
                    아래 주소를 구글 캘린더에 등록하면 여기서 등록한 캠페인 기간과
                    일정이 <b>자동으로 계속 반영</b>됩니다.
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={feedUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="input text-xs font-mono"
                    />
                    <button onClick={copy} className="btn-primary btn-sm whitespace-nowrap">
                      복사
                    </button>
                  </div>

                  <ol className="list-decimal list-inside space-y-1.5 bg-gray-50 rounded-lg p-4 text-xs text-gray-600">
                    <li>구글 캘린더 왼쪽 &quot;다른 캘린더&quot; 옆 + 버튼 클릭</li>
                    <li>&quot;URL로 추가&quot; 선택</li>
                    <li>위 주소를 붙여넣고 &quot;캘린더 추가&quot;</li>
                  </ol>

                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs space-y-1">
                    <p>
                      구글은 구독 캘린더를 보통 몇 시간 간격으로 갱신합니다. 방금 등록한
                      일정을 바로 넣으려면 일정 수정 창의 <b>&quot;구글 캘린더에 추가&quot;</b>
                      링크를 쓰세요.
                    </p>
                    <p>
                      이 주소를 아는 사람은 로그인 없이 일정을 볼 수 있으니 공유에 주의하세요.
                    </p>
                  </div>
                </>
              ) : (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-xs space-y-2">
                  <p className="font-semibold">구독 주소가 아직 설정되지 않았습니다.</p>
                  <p>
                    서버 환경변수에 아래 두 값을 넣고 재배포하면 구독 주소가 생성됩니다.
                  </p>
                  <pre className="bg-white border border-amber-200 rounded p-2 overflow-x-auto font-mono">
{`CALENDAR_FEED_TOKEN=아무-긴-랜덤-문자열
SUPABASE_SERVICE_ROLE_KEY=공구-어드민-supabase-service-role-key`}
                  </pre>
                  <p>
                    설정 전에도 일정 수정 창의 &quot;구글 캘린더에 추가&quot; 링크로 건별
                    등록은 가능합니다.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end px-6 py-4 border-t border-gray-200">
              <button onClick={() => setOpen(false)} className="btn-secondary">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
