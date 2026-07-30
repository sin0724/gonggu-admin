import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchCrmKols } from "@/lib/supabase/crm";

// tianxia-crm KOL 아카이브 검색 — 캠페인 인플루언서 추가 시 사용.
// 이 시스템(공구 어드민)에 로그인된 사용자만 호출 가능.
// 조회 소스는 lib/supabase/crm.ts 한 곳으로 모아둔다 — KOL 리스트 화면과
// 다른 컬럼을 읽으면 고정비·RS 조건이 화면마다 어긋난다.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  const { kols, error } = await searchCrmKols(q);
  if (error) {
    // 연동 키 미설정은 설정 문제라 503으로 구분해준다
    const missingKey = error.includes("CRM_SUPABASE_URL");
    return NextResponse.json({ error }, { status: missingKey ? 503 : 500 });
  }
  return NextResponse.json({ kols });
}
