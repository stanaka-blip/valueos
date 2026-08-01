/**
 * settlement save verify hotfix — DB非依存振る舞いテスト
 */
import { buildSettlementSavePatch } from "../lib/caseSettlements/settlementSaveLogic.ts";
import { settlementRowMatchesPatch } from "../lib/caseSettlements/settlementVerify.ts";
import { isSettlementStubAllowed } from "../lib/caseSettlements/settlementStubGate.ts";
import { saveCaseSettlementByCaseIdWithClient } from "../lib/caseSettlements/saveCaseSettlementCore.ts";
import { getCaseSettlementByCaseIdWithClient } from "../lib/caseSettlements/getCaseSettlementAdminCore.ts";
import type { CaseSettlementRow } from "../lib/database.types.ts";

function assert(name: string, cond: unknown, detail = "") {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exitCode = 1;
  } else {
    console.log("OK", name);
  }
}

function row(partial: Partial<CaseSettlementRow> = {}): CaseSettlementRow {
  return {
    id: "84d089bc-8390-47d0-a425-4cedb2040dbe",
    created_at: "",
    updated_at: "",
    case_id: "545b5859-f777-4038-9e22-10c6d46c0139",
    settlement_type: "前金",
    fee_rate: null,
    fee_amount: 0,
    deposit_rate: null,
    deposit_amount: null,
    payment_terms: null,
    card_brand: null,
    finance_company: null,
    approval_number: null,
    memo: null,
    loan_status: null,
    loan_status_updated_at: null,
    card_status: null,
    card_status_updated_at: null,
    ...partial,
  };
}

// --- stub gate ---
{
  const prev = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_GATEWAY_SETTLEMENT_STUB: process.env.ALLOW_GATEWAY_SETTLEMENT_STUB,
  };
  process.env.VERCEL_ENV = "production";
  process.env.NODE_ENV = "development";
  process.env.ALLOW_GATEWAY_SETTLEMENT_STUB = "1";
  assert("stub blocked on Vercel production", isSettlementStubAllowed() === false);

  process.env.VERCEL_ENV = "preview";
  assert("stub blocked on Vercel preview", isSettlementStubAllowed() === false);

  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = "production";
  process.env.ALLOW_GATEWAY_SETTLEMENT_STUB = "1";
  assert("stub blocked when NODE_ENV=production", isSettlementStubAllowed() === false);

  process.env.NODE_ENV = "development";
  process.env.ALLOW_GATEWAY_SETTLEMENT_STUB = "1";
  assert("stub allowed only local+flag", isSettlementStubAllowed() === true);

  process.env.ALLOW_GATEWAY_SETTLEMENT_STUB = "0";
  assert("stub off without flag", isSettlementStubAllowed() === false);

  if (prev.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = prev.VERCEL_ENV;
  process.env.NODE_ENV = prev.NODE_ENV;
  if (prev.ALLOW_GATEWAY_SETTLEMENT_STUB === undefined) {
    delete process.env.ALLOW_GATEWAY_SETTLEMENT_STUB;
  } else {
    process.env.ALLOW_GATEWAY_SETTLEMENT_STUB = prev.ALLOW_GATEWAY_SETTLEMENT_STUB;
  }
}

// --- match: 3社間 ---
{
  const built = buildSettlementSavePatch(
    {
      source: "settlement_form",
      settlement_type: "3社間決済",
      finance_company: "イオン",
      approval_number: "1111",
      fee_amount: 0,
    },
    row({ settlement_type: "前金" })
  );
  assert("build 3社間 patch", built.ok);
  if (built.ok) {
    const saved = row({
      settlement_type: "3社間決済",
      finance_company: "イオン",
      approval_number: "1111",
      card_brand: null,
      fee_amount: 0,
    });
    assert(
      "reSELECT matches 3社間/finance/approval",
      settlementRowMatchesPatch(saved, built.patch)
    );
    assert(
      "stale 前金 mismatches patch",
      settlementRowMatchesPatch(row({ settlement_type: "前金" }), built.patch) ===
        false
    );
  }
}

function createSaveMock(options: {
  existing: CaseSettlementRow | null;
  afterWrite: CaseSettlementRow | null;
  updateRows?: number;
}) {
  let writeDone = false;
  const caseId = "545b5859-f777-4038-9e22-10c6d46c0139";

  return {
    from(table: string) {
      if (table === "cases") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: caseId },
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        select: () => {
          const eqResult = {
            maybeSingle: async () => ({
              data: writeDone ? options.afterWrite : options.existing,
              error: null,
            }),
            then(resolve: (v: unknown) => unknown) {
              const src = writeDone ? options.afterWrite : options.existing;
              const rows = src ? [src] : [];
              return Promise.resolve(
                resolve({ data: rows, error: null, count: rows.length })
              );
            },
          };
          return { eq: () => eqResult };
        },
        update: () => {
          writeDone = true;
          const single = async () => {
            if ((options.updateRows ?? 1) === 0) {
              return { data: null, error: { message: "0 rows" }, count: 0 };
            }
            return {
              data: { id: options.existing!.id },
              error: null,
              count: 1,
            };
          };
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({ single }),
              }),
            }),
          };
        },
        insert: () => {
          writeDone = true;
          return {
            select: () => ({
              single: async () => ({
                data: { id: options.afterWrite!.id },
                error: null,
              }),
            }),
          };
        },
      };
    },
  } as never;
}

{
  const existing = row({ settlement_type: "前金" });
  const after = row({
    settlement_type: "3社間決済",
    finance_company: "イオン",
    approval_number: "1111",
    fee_amount: 0,
  });
  const result = await saveCaseSettlementByCaseIdWithClient(
    "545b5859-f777-4038-9e22-10c6d46c0139",
    {
      source: "settlement_form",
      settlement_type: "3社間決済",
      finance_company: "イオン",
      approval_number: "1111",
      fee_amount: 0,
    },
    createSaveMock({ existing, afterWrite: after })
  );
  assert("update+verify success", result.ok === true, JSON.stringify(result));
  if (result.ok) {
    assert("returns real settlement id", result.settlement_id === existing.id);
    assert("created false", result.created === false);
  }
}

{
  const existing = row({ settlement_type: "前金" });
  const result = await saveCaseSettlementByCaseIdWithClient(
    "545b5859-f777-4038-9e22-10c6d46c0139",
    {
      source: "settlement_form",
      settlement_type: "3社間決済",
      finance_company: "イオン",
      approval_number: "1111",
      fee_amount: 0,
    },
    createSaveMock({ existing, afterWrite: existing, updateRows: 0 })
  );
  assert("update 0 rows fails", result.ok === false);
}

{
  const existing = row({ settlement_type: "前金" });
  const result = await saveCaseSettlementByCaseIdWithClient(
    "545b5859-f777-4038-9e22-10c6d46c0139",
    {
      source: "settlement_form",
      settlement_type: "3社間決済",
      finance_company: "イオン",
      approval_number: "1111",
      fee_amount: 0,
    },
    createSaveMock({
      existing,
      afterWrite: row({ settlement_type: "前金" }),
      updateRows: 1,
    })
  );
  assert("reSELECT mismatch fails", result.ok === false);
}

{
  const existing = row({ settlement_type: "前金" });
  const result = await saveCaseSettlementByCaseIdWithClient(
    "545b5859-f777-4038-9e22-10c6d46c0139",
    {
      source: "settlement_form",
      settlement_type: "3社間決済",
      finance_company: "イオン",
      approval_number: "1111",
      fee_amount: 0,
    },
    createSaveMock({ existing, afterWrite: null, updateRows: 1 })
  );
  assert("reSELECT 0 rows fails", result.ok === false);
}

{
  const existing = row({
    settlement_type: "3社間決済",
    finance_company: "イオン",
    approval_number: "1111",
  });
  const read = await getCaseSettlementByCaseIdWithClient(
    "545b5859-f777-4038-9e22-10c6d46c0139",
    {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: existing, error: null }),
          }),
        }),
      }),
    } as never
  );
  assert("admin read ok (service_role path)", read.ok === true);
  if (read.ok) {
    assert("admin read returns 3社間", read.data?.settlement_type === "3社間決済");
    assert("admin read finance", read.data?.finance_company === "イオン");
  }
}

{
  const read = await getCaseSettlementByCaseIdWithClient("x", {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
            error: { message: "jwt/rls" },
          }),
        }),
      }),
    }),
  } as never);
  assert("read failure is error not null-ok", read.ok === false);
}

if (process.exitCode) {
  console.error("\nhotfix behavior failures");
  process.exit(1);
}
console.log("\nhotfix behavior ok");
