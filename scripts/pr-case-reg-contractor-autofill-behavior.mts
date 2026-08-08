import assert from "node:assert/strict";

import { applyContractorToCaseForm } from "../app/components/case-registration/applyContractorToCaseForm.ts";
import { buildCaseRegistrationMemo } from "../app/components/case-registration/caseRegistrationExtras.ts";
import {
  buildGatewayBody,
  resolvedDeliveryAddress,
} from "../app/components/case-registration/validation.ts";
import { createInitialCaseForm } from "../app/components/case-registration/types.ts";
import { parseCaseExtras } from "../app/admin/orders/parseCaseExtras.ts";

const base = {
  ...createInitialCaseForm(),
  dealer_id: "11111111-1111-1111-1111-111111111111",
  customer_name: "顧客A",
  site_address: "東京都千代田区1-1",
  order_received_date: "2026-08-08",
  delivery_same_as_site: true,
  contractor_name: "手入力施工店",
};

const applied = applyContractorToCaseForm(base, {
  id: "c1",
  name: " マスタ施工店 ",
  delivery_name: " 標準倉庫 ",
  delivery_address: " 大阪府大阪市1-2 ",
  delivery_phone: " 06-1111-2222 ",
  receiver_name: " 荷受太郎 ",
});

assert.equal(applied.contractor_name, "マスタ施工店");
assert.equal(applied.delivery_name, "標準倉庫");
assert.equal(applied.delivery_address, "大阪府大阪市1-2");
assert.equal(applied.delivery_phone, "06-1111-2222");
assert.equal(applied.receiver_name, "荷受太郎");
assert.equal(applied.delivery_same_as_site, false);
assert.equal(applied.site_address, "東京都千代田区1-1", "設置先はコピーしない");

const edited = {
  ...applied,
  contractor_name: "手修正施工店",
  delivery_name: "手修正倉庫",
  delivery_phone: "06-9999-0000",
};

const body = buildGatewayBody(edited, [], {
  settlement_type: "前金",
  finance_company: "",
  approval_number: "",
  card_brand: "",
});

assert.equal(body.case.delivery_address, "大阪府大阪市1-2");
assert.equal(body.case.construction_detail, "【施工店名】手修正施工店");
assert.equal(
  body.case.memo,
  "【納品先名称】手修正倉庫\n【荷受け担当者】荷受太郎\n【荷受け電話番号】06-9999-0000"
);
assert.equal(
  "contractor_id" in body.case,
  false,
  "gateway body に contractor_id を載せない"
);

const parsed = parseCaseExtras({
  memo: body.case.memo,
  constructionDetail: body.case.construction_detail,
});
assert.equal(parsed.deliveryName, "手修正倉庫");
assert.equal(parsed.receiverName, "荷受太郎");
assert.equal(parsed.receiverPhone, "06-9999-0000");
assert.equal(parsed.contractorName, "手修正施工店");

assert.equal(
  resolvedDeliveryAddress(applied),
  "大阪府大阪市1-2"
);

assert.equal(
  buildCaseRegistrationMemo({
    delivery_name: "",
    receiver_name: "A",
    delivery_phone: "1",
  }),
  "【荷受け担当者】A\n【荷受け電話番号】1"
);

console.log("case registration contractor autofill behavior checks passed");
