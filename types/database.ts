export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      campaigns: {
        Row: Campaign;
        Insert: CampaignInsert;
        Update: CampaignUpdate;
      };
      influencers: {
        Row: Influencer;
        Insert: InfluencerInsert;
        Update: InfluencerUpdate;
      };
      campaign_influencers: {
        Row: CampaignInfluencer;
        Insert: CampaignInfluencerInsert;
        Update: CampaignInfluencerUpdate;
      };
    };
  };
}

export interface Campaign {
  id: string;
  client_name: string;
  campaign_name: string;
  rs: string | null;
  start_date: string | null;
  end_date: string | null;
  purchase_form_url: string | null;
  drive_url: string | null;
  created_at: string;
}

export type CampaignInsert = Omit<Campaign, "id" | "created_at">;
export type CampaignUpdate = Partial<CampaignInsert>;

export interface Influencer {
  id: string;
  name: string;
  account_url: string | null;
  created_at: string;
}

export type InfluencerInsert = Omit<Influencer, "id" | "created_at">;
export type InfluencerUpdate = Partial<InfluencerInsert>;

export interface CampaignInfluencer {
  id: string;
  campaign_id: string;
  influencer_id: string;
  personal_code: string;
  is_product_sent: boolean;
  sent_date: string | null;
  content_url: string | null;
  is_uploaded: boolean;
  sales_amount: number;
  settlement_method: string | null;
  settlement_amount: number;
  is_settled: boolean;
  settled_date: string | null;
  notes: string | null;
  created_at: string;
}

export type CampaignInfluencerInsert = Omit<
  CampaignInfluencer,
  "id" | "created_at"
>;
export type CampaignInfluencerUpdate = Partial<CampaignInfluencerInsert>;

export interface CampaignInfluencerWithDetails extends CampaignInfluencer {
  influencer: Influencer;
}

export type ProgressStatus =
  | "발송대기"
  | "업로드대기"
  | "판매중"
  | "정산대기"
  | "정산완료";

export function getProgressStatus(ci: CampaignInfluencer): ProgressStatus {
  if (!ci.is_product_sent) return "발송대기";
  if (ci.is_product_sent && !ci.is_uploaded) return "업로드대기";
  if (ci.is_settled) return "정산완료";
  if (ci.is_uploaded && !ci.is_settled && ci.sales_amount > 0) return "정산대기";
  return "판매중";
}

export const STATUS_COLORS: Record<ProgressStatus, string> = {
  발송대기: "bg-gray-100 text-gray-700",
  업로드대기: "bg-yellow-100 text-yellow-700",
  판매중: "bg-blue-100 text-blue-700",
  정산대기: "bg-orange-100 text-orange-700",
  정산완료: "bg-green-100 text-green-700",
};
