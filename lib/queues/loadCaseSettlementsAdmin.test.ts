/**
 * 社内キュー決済取得（admin）と発注/回収ガードの回帰テスト
 *
 * 実行:
 *   npx tsx --test lib/queues/loadCaseSettlementsAdmin.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildCollectionQueueRow,
  type CollectionQueueCaseInput,
} from "@/lib/queues/collectionQueue";
import { evaluateOrderQueueGate } from "@/lib/queues/orderQueue";
import type { QueueSettlementRow } from "@/lib/queues/loadCaseSettlementsAdmin";

const require = createRequire(import.meta.url);
const QUEUE_ROOT = join(process.cwd(), "lib/queues");
const APP_QUEUES = join(process.cwd(), "app/queues");

function settlementRow(
  partial: Partial<QueueSettlementRow> & { settlement_type: string | null }
): QueueSettlementRow {
  return {
    case_id: partial.case_id ?? "case-1",
    settlement_type: partial.settlement_type,
    deposit_amount: partial.deposit_amount ?? null,
    loan_status: partial.loan_status ?? null,
    card_status: partial.card_status ?? null,
    approval_number: partial.approval_number ?? null,
    memo: partial.memo ?? null,
  };
}

function mockClient(result: {
  data: unknown;
  error: { message: string } | null;
}): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return Promise.resolve(result);
        },
      };
    },
  } as unknown as SupabaseClient;
}

async function loadAdminModule() {
  const serverOnlyPath = require.resolve("server-only");
  const previous = require.cache[serverOnlyPath];
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as NodeModule;

  try {
    return await import(
      `${pathToFileURL(join(QUEUE_ROOT, "loadCaseSettlementsAdmin.ts")).href}?t=${Date.now()}`
    );
  } finally {
    if (previous) require.cache[serverOnlyPath] = previous;
    else delete require.cache[serverOnlyPath];
  }
}

test("発注管理: 売掛設定済みは未設定扱いにならず発注可", () => {
  const gate = evaluateOrderQueueGate({
    settlement: settlementRow({ settlement_type: "売掛" }),
  });
  assert.equal(gate.canOrder, true);
  assert.equal(gate.blockReason, null);
  assert.notEqual(gate.blockReason, "決済方法を選択してください");
});

test("発注管理: 前金未入金・カード未完了・3社間未承認は正しい理由", () => {
  assert.equal(
    evaluateOrderQueueGate({
      settlement: settlementRow({
        settlement_type: "前金",
        deposit_amount: 100_000,
      }),
      invoices: [{ id: "inv-1", status: "issued", invoice_amount: 100_000 }],
      payments: [],
    }).blockReason,
    "前金の入金確認待ち"
  );

  assert.equal(
    evaluateOrderQueueGate({
      settlement: settlementRow({
        settlement_type: "カード",
        card_status: "未決済",
      }),
    }).blockReason,
    "カード決済確認待ち"
  );

  assert.equal(
    evaluateOrderQueueGate({
      settlement: settlementRow({
        settlement_type: "3社間決済",
        loan_status: "申請中",
      }),
    }).blockReason,
    "3社間審査承認待ち"
  );
});

test("発注管理: 本当に未設定（settlement null）だけ未設定理由", () => {
  const gate = evaluateOrderQueueGate({ settlement: null });
  assert.equal(gate.canOrder, false);
  assert.equal(gate.blockReason, "決済方法を選択してください");
});

test("loadAllCaseSettlementsAdmin: DB読取失敗は ok:false（未設定へフォールバックしない）", async () => {
  const mod = await loadAdminModule();
  const result = await mod.loadAllCaseSettlementsAdmin({
    client: mockClient({
      data: null,
      error: { message: "permission denied for table case_settlements" },
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /決済条件の取得に失敗/);
    assert.match(result.error, /permission denied/);
    assert.equal("data" in result, false);
  }
});

test("loadAllCaseSettlementsAdmin: 成功時は data 配列を返す", async () => {
  const mod = await loadAdminModule();
  const row = settlementRow({
    case_id: "case-ar",
    settlement_type: "売掛",
  });
  const result = await mod.loadAllCaseSettlementsAdmin({
    client: mockClient({ data: [row], error: null }),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.settlement_type, "売掛");
  }
});

test("order/collection loaders: settlement failure becomes queue error (source)", () => {
  for (const file of ["loadOrderQueue.ts", "loadCollectionQueue.ts"]) {
    const source = readFileSync(join(QUEUE_ROOT, file), "utf8");
    assert.match(source, /if \(!settlementsResult\.ok\)/);
    assert.match(
      source,
      /return \{ rows: \[\], error: settlementsResult\.error \}/
    );
  }
});

test("order and collection queue loaders use admin settlement helper (not anon)", () => {
  for (const file of ["loadOrderQueue.ts", "loadCollectionQueue.ts"]) {
    const source = readFileSync(join(QUEUE_ROOT, file), "utf8");
    assert.match(source, /import "server-only"/);
    assert.match(source, /loadAllCaseSettlementsAdmin/);
    assert.doesNotMatch(
      source,
      /supabase\.from\(["']case_settlements["']\)/,
      `${file} must not read case_settlements via anon createClient`
    );
  }
});

test("loadCaseSettlementsAdmin is server-only and uses getServiceRoleSupabase", () => {
  const source = readFileSync(
    join(QUEUE_ROOT, "loadCaseSettlementsAdmin.ts"),
    "utf8"
  );
  assert.match(source, /import "server-only"/);
  assert.match(source, /getServiceRoleSupabase/);
  assert.match(source, /@\/lib\/supabase\/serverAdmin/);
  assert.doesNotMatch(source, /from "@\/lib\/supabase"/);
});

test("service_role がキュー page / UI へ露出しない", () => {
  const files = [
    join(APP_QUEUES, "orders/page.tsx"),
    join(APP_QUEUES, "collections/page.tsx"),
    join(APP_QUEUES, "deliveries/page.tsx"),
    join(APP_QUEUES, "QueuePlaceholder.tsx"),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /getServiceRoleSupabase|SUPABASE_SERVICE_ROLE|service_role/
    );
    assert.doesNotMatch(source, /loadAllCaseSettlementsAdmin/);
    assert.doesNotMatch(source, /"use client"/);
  }
});

test("delivery queue does not load case_settlements (out of scope)", () => {
  const source = readFileSync(join(QUEUE_ROOT, "loadDeliveryQueue.ts"), "utf8");
  assert.doesNotMatch(source, /case_settlements|loadAllCaseSettlementsAdmin/);
});

function collectionBase(
  partial: Partial<CollectionQueueCaseInput> & {
    settlement_type: string | null;
  }
): CollectionQueueCaseInput {
  return {
    id: "c1",
    case_no: "C-1",
    status: "進行中",
    customer_name: "顧客",
    order_received_date: "2026-01-01",
    dealer_name: "販社",
    settlement_type: partial.settlement_type,
    deposit_amount: partial.deposit_amount ?? null,
    loan_status: partial.loan_status ?? null,
    card_status: partial.card_status ?? null,
    approval_number: partial.approval_number ?? null,
    orders: partial.orders ?? [],
    invoices: partial.invoices ?? [],
    payments: partial.payments ?? [],
    today: "2026-07-01",
  };
}

test("回収管理: 4決済条件を正しく判定（表示ロジック不変）", () => {
  const advance = buildCollectionQueueRow(
    collectionBase({
      settlement_type: "前金",
      deposit_amount: 50_000,
      invoices: [],
      payments: [],
    })
  );
  assert.ok(advance);
  assert.equal(advance?.settlementType, "前金");
  assert.equal(advance?.stateLabel, "請求待ち");

  const credit = buildCollectionQueueRow(
    collectionBase({
      settlement_type: "売掛",
      orders: [
        {
          id: "o1",
          status: "納品済",
          delivered_date: "2026-06-01",
        },
      ],
      invoices: [],
      payments: [],
    })
  );
  assert.ok(credit);
  assert.equal(credit?.settlementType, "売掛");
  assert.equal(credit?.stateLabel, "請求待ち");

  const card = buildCollectionQueueRow(
    collectionBase({
      settlement_type: "カード",
      card_status: "未決済",
    })
  );
  assert.ok(card);
  assert.equal(card?.settlementType, "カード");
  assert.equal(card?.stateLabel, "カード決済待ち");

  const loan = buildCollectionQueueRow(
    collectionBase({
      settlement_type: "3社間決済",
      loan_status: "申請中",
      approval_number: null,
    })
  );
  assert.ok(loan);
  assert.equal(loan?.settlementType, "3社間決済");
  assert.equal(loan?.stateLabel, "審査承認待ち");
});

test("回収管理: 未設定（settlement_type null）はキュー対象外のまま", () => {
  const row = buildCollectionQueueRow(
    collectionBase({ settlement_type: null })
  );
  assert.equal(row, null);
});

test("意図しない差分なし: WorkflowEngine / SETTLEMENT_RULES 非変更（静的）", () => {
  // 本PRは loaders のみ。ルールファイルにキュー向け分岐を足していないこと。
  const engine = readFileSync(
    join(process.cwd(), "lib/workflow/WorkflowEngine.ts"),
    "utf8"
  );
  const rules = readFileSync(
    join(process.cwd(), "lib/workflow/settlementRules.ts"),
    "utf8"
  );
  assert.doesNotMatch(engine, /loadAllCaseSettlementsAdmin|loadOrderQueue/);
  assert.doesNotMatch(rules, /loadAllCaseSettlementsAdmin|queues\//);
});
