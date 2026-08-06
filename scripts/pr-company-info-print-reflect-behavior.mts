/**
 * 帳票会社情報ヘルパ behavior テスト
 * Run: npx tsx scripts/pr-company-info-print-reflect-behavior.mts
 */
import assert from "node:assert/strict";

import {
  companyDisplayName,
  formatPostalAddress,
  hasBankTransferInfo,
  trimOrNull,
} from "../lib/companyInfo/printCompanyInfo.ts";
import { DEFAULT_COMPANY_NAME } from "../lib/companyInfo/types.ts";

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

const empty = {
  company_name: DEFAULT_COMPANY_NAME,
  postal_code: null,
  address: null,
  phone: null,
  fax: null,
  email: null,
  invoice_registration_number: null,
  bank_name: null,
  bank_branch: null,
  bank_account_type: null,
  bank_account_number: null,
  bank_account_holder: null,
};

check("companyDisplayName uses settings name", () => {
  assert.equal(
    companyDisplayName({ ...empty, company_name: "株式会社テスト" }),
    "株式会社テスト"
  );
});

check("formatPostalAddress null when both empty", () => {
  assert.equal(formatPostalAddress(null, null), null);
  assert.equal(formatPostalAddress("  ", ""), null);
});

check("formatPostalAddress combines when present", () => {
  assert.equal(
    formatPostalAddress("100-0001", "東京都千代田区"),
    "〒100-0001 東京都千代田区"
  );
});

check("hasBankTransferInfo false when all empty", () => {
  assert.equal(hasBankTransferInfo(empty), false);
});

check("hasBankTransferInfo true when any bank field set", () => {
  assert.equal(
    hasBankTransferInfo({ ...empty, bank_name: "みずほ銀行" }),
    true
  );
});

check("trimOrNull does not invent placeholders", () => {
  assert.equal(trimOrNull(""), null);
  assert.equal(trimOrNull("  "), null);
  assert.equal(trimOrNull("T123"), "T123");
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll company info print reflect behavior checks passed");
