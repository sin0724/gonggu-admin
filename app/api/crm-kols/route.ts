import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCrmClient } from "@/lib/supabase/crm";

// tianxia-crm KOL 아카이브 검색 — 캠페인 인플루언서 추가 시 사용.
// 이 시스템(공구 어드민)에 로그인된 사용자만 호출 가능.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const crm = createCrmClient();
  if (!crm) {
    return NextResponse.json(
      { error: "CRM 연동 키(CRM_SUPABASE_URL/SERVICE_ROLE_KEY)가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  let query = crm
    .from("kols")
    .select("id, name, instagram_handle, followers, categories, rate")
    .order("followers", { ascending: false, nullsFirst: false })
    .limit(20);
  if (q) {
    query = query.or(`name.ilike.%${q}%,instagram_handle.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ kols: data ?? [] });
}
