import assert from "node:assert/strict";

import {
  buildCaseRegistrationConstructionDetail,
  buildCaseRegistrationMemo,
  upsertLabeledMemoFields,
} from "../app/components/case-registration/caseRegistrationExtras.ts";
import {
  buildGatewayBody,
  resolvedDeliveryAddress,
  validateStep1,
} from "../app/components/case-registration/validation.ts";
import { createInitialCaseForm } from "../app/components/case-registration/types.ts";
import { parseCaseExtras } from "../app/admin/orders/parseCaseExtras.ts";

const baseForm = {
  ...createInitialCaseForm(),
  dealer_id: "11111111-1111-1111-1111-111111111111",
  customer_name: "顧客A",
  site_address: "東京都千代田区",
  order_received_date: "2026-07-01",
  delivery_same_as_site: true,
};

assert.equal(
  resolvedDeliveryAddress({
    ...baseForm,
    delivery_same_as_site: true,
    delivery_address: "別住所",
  }),
  "東京都千代田区"
);

const withPhones = {
  ...baseForm,
  customer_phone: "03-1111-2222",
  delivery_phone: "03-3333-4444",
  receiver_name: "山田太郎",
};
const body = buildGatewayBody(withPhones, [], {
  settlement_type: "前金",
  finance_company: "",
  approval_number: "",
  card_brand: "",
});

assert.equal(body.case.case_no, null);
assert.equal(body.case.customer_phone, "03-1111-2222");
assert.equal(body.case.construction_detail, null);
assert.equal(
  body.case.memo,
  "【荷受け担当者】山田太郎\n【荷受け電話番号】03-3333-4444"
);
assert.notEqual(body.case.customer_phone, body.case.memo);

const withContractor = buildGatewayBody(
  {
    ...baseForm,
    contractor_name: "施工店サンプル",
    delivery_phone: "090-0000-0000",
  },
  [],
  {
    settlement_type: "前金",
    finance_company: "",
    approval_number: "",
    card_brand: "",
  }
);
assert.equal(
  withContractor.case.construction_detail,
  "【施工店名】施工店サンプル"
);

assert.equal(
  buildCaseRegistrationMemo({
    receiver_name: "佐藤",
    delivery_phone: "03-0000-0000",
  }),
  "【荷受け担当者】佐藤\n【荷受け電話番号】03-0000-0000"
);
assert.equal(
  buildCaseRegistrationMemo({
    delivery_name: "倉庫A",
    receiver_name: "佐藤",
    delivery_phone: "03-0000-0000",
  }),
  "【納品先名称】倉庫A\n【荷受け担当者】佐藤\n【荷受け電話番号】03-0000-0000"
);
assert.equal(
  buildCaseRegistrationConstructionDetail({ contractor_name: "ABC工務店" }),
  "【施工店名】ABC工務店"
);

const once = upsertLabeledMemoFields("【案件備考】既存メモ", {
  荷受け担当者: "田中",
  荷受け電話番号: "080-1111-2222",
});
assert.equal(once, "【案件備考】既存メモ\n【荷受け担当者】田中\n【荷受け電話番号】080-1111-2222");

const twice = upsertLabeledMemoFields(once, {
  荷受け担当者: "田中",
  荷受け電話番号: "080-1111-2222",
});
assert.equal(twice, once);

const updated = upsertLabeledMemoFields(once, {
  荷受け担当者: "鈴木",
  荷受け電話番号: "080-1111-2222",
});
assert.equal(
  updated,
  "【案件備考】既存メモ\n【荷受け担当者】鈴木\n【荷受け電話番号】080-1111-2222"
);
assert.equal((updated?.match(/【荷受け担当者】/g) || []).length, 1);

const parsed = parseCaseExtras({ memo: updated, constructionDetail: null });
assert.equal(parsed.receiverName, "鈴木");
assert.equal(parsed.receiverPhone, "080-1111-2222");
assert.equal(parsed.caseMemo, "既存メモ");

assert.equal(Object.keys(validateStep1(baseForm)).length, 0);

console.log("case registration step1 simplify behavior checks passed");
