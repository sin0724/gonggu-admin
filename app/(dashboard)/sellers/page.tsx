import { createClient } from "@/lib/supabase/server";
import SellerDirectory from "@/components/sellers/seller-directory";
import { Seller, SellerSale } from "@/types/database";

export default async function SellersPage() {
  const supabase = await createClient();

  const [{ data: sellers, error }, { data: sales }, { data: campaigns }] =
    await Promise.all([
      supabase.from("sellers").select("*").order("name"),
      supabase.from("seller_sales").select("*"),
      supabase
        .from("campaigns")
        .select("id, campaign_name, client_name")
        .order("created_at", { ascending: false }),
    ]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        <p>셀러 목록을 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-xs mt-1">
          supabase/migrations/020_sellers.sql 을 적용했는지 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">셀러 리스트</h1>
        <p className="text-sm text-gray-500 mt-1">
          총판·공구 셀러의 고정비·RS·공구 카테고리와 지난 공구매출을 관리합니다.
        </p>
      </div>

      <SellerDirectory
        sellers={(sellers as Seller[]) ?? []}
        sales={(sales as SellerSale[]) ?? []}
        campaigns={campaigns ?? []}
      />
    </div>
  );
}
