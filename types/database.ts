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

export type DealType = "rs" | "supply";

export interface Campaign {
  id: string;
  client_name: string;
  campaign_name: string;
  deal_type: DealType | null;
  normal_price: number | null;
  online_min_price: number | null;
  supply_price: number | null;
  gonggu_price: number | null;
  vendor_fee_rate: number | null;
  influencer_rs_rate: number | null;
  total_rs_rate: number | null;
  shipping_fee: number | null;
  shipping_payer: string | null;
  vat_included: boolean | null;
  start_date: string | null;
  end_date: string | null;
  purchase_form_url: string | null;
  response_sheet_url: string | null;
  drive_url: string | null;
  created_at: string;
}

export type CampaignInsert = Omit<Campaign, "id" | "created_at">;
export type CampaignUpdate = Partial<CampaignInsert>;

export interface Influencer {
  id: string;
  name: string;
  account_url: string | null;
  bank_account_holder: string | null;
  bank_account_type: string | null;
  bank_swift_code: string | null;
  bank_account_number: string | null;
  bank_email: string | null;
  bank_name: string | null;
  bank_address: string | null;
  created_at: string;
}

/** 정산 계좌 정보가 입력되어 있는지 (핵심 필드 기준) */
export function hasBankDetails(inf: Influencer): boolean {
  return Boolean(inf.bank_account_holder && inf.bank_account_number && inf.bank_name);
}

export type InfluencerInsert = Omit<Influencer, "id" | "created_at">;
export type InfluencerUpdate = Partial<InfluencerInsert>;

export type ContentType =
  | "reels"
  | "story"
  | "thread"
  | "feed"
  | "youtube"
  | "tiktok"
  | "blog"
  | "other";

export interface ContentItem {
  type: ContentType;
  url: string;
}

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  reels: "릴스",
  story: "스토리",
  thread: "쓰레드",
  feed: "피드",
  youtube: "유튜브",
  tiktok: "틱톡",
  blog: "블로그",
  other: "기타",
};

export interface CampaignInfluencer {
  id: string;
  campaign_id: string;
  influencer_id: string;
  purchase_url: string | null;
  sheet_url: string | null;
  is_product_sent: boolean;
  sent_date: string | null;
  content_url: string | null;
  contents: ContentItem[] | null;
  is_uploaded: boolean;
  sales_amount: number;
  quantity: number;
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

export interface Manager {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export type ManagerInsert = Omit<Manager, "id" | "created_at">;
export type ManagerUpdate = Partial<ManagerInsert>;

export type ProspectStatus = "발송완료" | "입점완료" | "무응답" | "거절";

export interface Prospect {
  id: string;
  company_name: string;
  business_number: string;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  status: ProspectStatus;
  manager_id: string | null;
  created_at: string;
}

export interface ProspectWithManager extends Prospect {
  manager: Manager | null;
}

export type ProspectInsert = Omit<Prospect, "id" | "created_at">;
export type ProspectUpdate = Partial<ProspectInsert>;

export const PROSPECT_STATUS_COLORS: Record<ProspectStatus, string> = {
  발송완료: "bg-blue-100 text-blue-700",
  입점완료: "bg-green-100 text-green-700",
  무응답: "bg-gray-100 text-gray-700",
  거절: "bg-red-100 text-red-700",
};

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
