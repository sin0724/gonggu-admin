import Link from "next/link";
import CampaignForm from "@/components/campaigns/campaign-form";

export default function NewCampaignPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/campaigns" className="hover:text-gray-700">
          캠페인 관리
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">신규 캠페인 등록</span>
      </nav>

      <div>
        <h1 className="text-xl font-bold text-gray-900">신규 캠페인 등록</h1>
        <p className="text-sm text-gray-500 mt-1">새로운 공구 캠페인을 등록합니다.</p>
      </div>

      <CampaignForm mode="create" />
    </div>
  );
}
