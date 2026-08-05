import assert from "node:assert/strict";

import {
  buildCaseRegistrationConstructionDetail,
  buildCaseRegistrationMemo,
} from "../app/components/case-registration/caseRegistrationExtras.ts";
import {
  buildGatewayBody,
  resolvedDeliveryAddress,
  validateStep1,
} from "../app/components/case-registration/validation.ts";
import { createInitialCaseForm } from "../app/components/case-registration/types.ts";

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
assert.equal(body.case.memo, "【荷受け電話番号】03-3333-4444");
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
  buildCaseRegistrationMemo({ delivery_phone: "03-0000-0000" }),
  "【荷受け電話番号】03-0000-0000"
);
assert.equal(
  buildCaseRegistrationConstructionDetail({ contractor_name: "ABC工務店" }),
  "【施工店名】ABC工務店"
);

assert.equal(Object.keys(validateStep1(baseForm)).length, 0);

console.log("case registration step1 simplify behavior checks passed");
