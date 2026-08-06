/**
 * 会社情報保存 normalize behavior テスト
 * Run: npx tsx scripts/pr-company-settings-ui-behavior.mts
 */
import assert from "node:assert/strict";

import { normalizeCompanySettingsSaveBody } from "../lib/companyInfo/companySettingsDto.ts";

let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("OK", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL", name, e);
  }
}

check("company_name required", () => {
  const result = normalizeCompanySettingsSaveBody({
    company_name: "  ",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.field_errors?.company_name, "会社名は必須です");
});

check("empty optional fields become null", () => {
  const result = normalizeCompanySettingsSaveBody({
    company_name: "株式会社Value Ecology",
    postal_code: "  ",
    address: "",
    phone: null,
    invoice_registration_number: "",
    bank_name: "  ",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.company_name, "株式会社Value Ecology");
  assert.equal(result.data.postal_code, null);
  assert.equal(result.data.address, null);
  assert.equal(result.data.phone, null);
  assert.equal(result.data.invoice_registration_number, null);
  assert.equal(result.data.bank_name, null);
});

check("trimmed values are kept", () => {
  const result = normalizeCompanySettingsSaveBody({
    company_name: " 株式会社Value Ecology ",
    postal_code: " 100-0001 ",
    invoice_registration_number: "T1234567890123",
    bank_account_type: "普通",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.company_name, "株式会社Value Ecology");
  assert.equal(result.data.postal_code, "100-0001");
  assert.equal(result.data.invoice_registration_number, "T1234567890123");
  assert.equal(result.data.bank_account_type, "普通");
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll company settings UI behavior checks passed");
