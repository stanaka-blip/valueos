/**
 * company_settings loader behavior テスト
 * Run: npx tsx scripts/pr-company-settings-foundation-behavior.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCompanySettingsRead } from "../lib/companyInfo/getCompanySettingsAdminCore.ts";
import {
  DEFAULT_COMPANY_NAME,
  createDefaultCompanySettings,
} from "../lib/companyInfo/types.ts";

const ROOT = new URL("..", import.meta.url).pathname;
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

check("DEFAULT_COMPANY_NAME is 株式会社Value Ecology", () => {
  assert.equal(DEFAULT_COMPANY_NAME, "株式会社Value Ecology");
});

check("fallback has null optional fields only", () => {
  const row = createDefaultCompanySettings();
  assert.equal(row.id, true);
  assert.equal(row.company_name, "株式会社Value Ecology");
  assert.equal(row.postal_code, null);
  assert.equal(row.address, null);
  assert.equal(row.phone, null);
  assert.equal(row.fax, null);
  assert.equal(row.email, null);
  assert.equal(row.invoice_registration_number, null);
  assert.equal(row.bank_name, null);
  assert.equal(row.bank_branch, null);
  assert.equal(row.bank_account_type, null);
  assert.equal(row.bank_account_number, null);
  assert.equal(row.bank_account_holder, null);
});

check("missing row uses fallback source", () => {
  const result = resolveCompanySettingsRead({
    data: null,
    errorMessage: null,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.source, "fallback");
  assert.equal(result.data.company_name, "株式会社Value Ecology");
  assert.equal(result.data.invoice_registration_number, null);
  assert.equal(result.data.bank_account_number, null);
});

check("db row is returned as source=db", () => {
  const result = resolveCompanySettingsRead({
    data: {
      id: true,
      company_name: "株式会社Value Ecology",
      postal_code: "100-0001",
      address: "東京都千代田区",
      phone: "03-0000-0000",
      fax: null,
      email: null,
      invoice_registration_number: "T1234567890123",
      bank_name: "みずほ銀行",
      bank_branch: "本店",
      bank_account_type: "普通",
      bank_account_number: "1234567",
      bank_account_holder: "カ）バリューエコロジー",
      created_at: "2026-08-06T00:00:00Z",
      updated_at: "2026-08-06T00:00:00Z",
    },
    errorMessage: null,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.source, "db");
  assert.equal(result.data.postal_code, "100-0001");
  assert.equal(result.data.invoice_registration_number, "T1234567890123");
});

check("db error is not treated as missing/fallback", () => {
  const result = resolveCompanySettingsRead({
    data: null,
    errorMessage: "permission denied",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error_code, "COMPANY_SETTINGS_READ_FAILED");
});

check("fallback never invents invoice or bank placeholders", () => {
  const row = createDefaultCompanySettings();
  assert.equal(row.invoice_registration_number, null);
  assert.equal(row.bank_name, null);
  assert.equal(row.bank_branch, null);
  assert.equal(row.bank_account_type, null);
  assert.equal(row.bank_account_number, null);
  assert.equal(row.bank_account_holder, null);
  assert.doesNotMatch(JSON.stringify(row), /T0{10,}/);
  assert.doesNotMatch(JSON.stringify(row), /設定してください/);
});

check("admin module does not leak service role into client print pages", () => {
  const clientPrints = [
    "app/orders/[id]/print/page.tsx",
    "app/orders/[id]/delivery-print/page.tsx",
  ];
  for (const rel of clientPrints) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.doesNotMatch(src, /getServiceRoleSupabase/);
    assert.doesNotMatch(src, /SUPABASE_SERVICE_ROLE/);
    assert.doesNotMatch(src, /getCompanySettingsAdmin/);
    assert.match(src, /fetchCompanySettingsForPrint/);
  }
  const invoice = readFileSync(
    join(ROOT, "app/invoices/[id]/print/page.tsx"),
    "utf8"
  );
  assert.match(invoice, /getCompanySettingsAdmin/);
  assert.doesNotMatch(invoice, /getServiceRoleSupabase/);
  assert.doesNotMatch(invoice, /SUPABASE_SERVICE_ROLE/);
});

check("server-only admin file marks server-only", () => {
  const admin = readFileSync(
    join(ROOT, "lib/companyInfo/getCompanySettingsAdmin.ts"),
    "utf8"
  );
  assert.match(admin, /import "server-only"/);
  assert.match(admin, /getServiceRoleSupabase/);
});

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll company settings foundation behavior checks passed");
