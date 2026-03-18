import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CampaignForm from "@/components/campaigns/campaign-form";

interface EditCampaignPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCampaignPage({ params }: EditCampaignPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  return (
    <div className="space-y-4 max-w-3xl">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/campaigns" className="hover:text-gray-700">
          캠페인 관리
        </Link>
        <span>/</span>
        <Link href={`/campaigns/${id}`} className="hover:text-gray-700">
          {campaign.campaign_name}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">수정</span>
      </nav>

      <div>
        <h1 className="text-xl font-bold text-gray-900">캠페인 수정</h1>
        <p className="text-sm text-gray-500 mt-1">{campaign.campaign_name}</p>
      </div>

      <CampaignForm campaign={campaign} mode="edit" />
    </div>
  );
}
