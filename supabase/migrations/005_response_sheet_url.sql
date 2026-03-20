-- 캠페인에 응답 시트 링크 추가 (구매 양식과 연동된 Google Sheets)
ALTER TABLE campaigns
  ADD COLUMN response_sheet_url TEXT;
