-- 공구 카테고리 표기를 tianxia-crm과 일치시킨다.
--
-- 이 앱은 "헬스/건기식"(슬래시), CRM은 "헬스·건기식"(U+00B7 가운뎃점)을 쓰고 있었다.
-- KOL은 CRM 값을 그대로 읽어 필터하므로, 셀러에 저장된 기존 값도 같은 표기로
-- 맞춰야 셀러/KOL 필터가 같은 카테고리를 가리킨다.
--
-- array_replace는 해당 원소가 없으면 배열을 그대로 두므로 재실행에 안전하다.

UPDATE sellers
SET categories = array_replace(categories, '헬스/건기식', '헬스·건기식')
WHERE '헬스/건기식' = ANY (categories);

-- 혹시 다른 표기로 들어간 값들도 함께 정리 (가져오기·직접 입력 과정에서 생길 수 있음)
UPDATE sellers
SET categories = array_replace(categories, '건기식', '헬스·건기식')
WHERE '건기식' = ANY (categories);

UPDATE sellers
SET categories = array_replace(categories, '헬스', '헬스·건기식')
WHERE '헬스' = ANY (categories);
