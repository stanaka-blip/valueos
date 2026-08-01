import {
  validateStep1,
  validateStep2,
  validateStep3,
  buildGatewayBody,
  hasSettlementErrors,
  safeUserErrorMessage,
} from "../app/components/case-registration/validation.ts";
import {
  createEmptyLine,
  createInitialCaseForm,
  createInitialSettlementForm,
  registrationFingerprint,
  SETTLEMENT_TYPES,
} from "../app/components/case-registration/types.ts";
import {
  createIdempotencyKey,
  submitCaseRegistration,
} from "../app/components/case-registration/submitCaseRegistration.ts";
import { CASE_REGISTRATION_SETTLEMENT_TYPES } from "../lib/caseSettlementTypes.ts";

function assert(name: string, cond: unknown, detail = "") {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exitCode = 1;
  } else {
    console.log("OK", name);
  }
}

function settlementOf(
  type: (typeof SETTLEMENT_TYPES)[number] | "",
  extras: Partial<ReturnType<typeof createInitialSettlementForm>> = {}
) {
  return {
    ...createInitialSettlementForm(),
    settlement_type: type,
    ...extras,
  };
}

async function main() {
  const empty = createInitialCaseForm();
  // 受注日は初期値あり。未入力は販売店・顧客名・設置先の3必須が落ちる
  assert("1 step1 empty fails", Object.keys(validateStep1(empty)).length >= 3);

  const ok1 = {
    ...empty,
    dealer_id: "11111111-1111-1111-1111-111111111111",
    customer_name: "顧客A",
    site_address: "東京都",
    order_received_date: "2026-07-01",
    delivery_same_as_site: true,
  };
  assert("1 step1 ok", Object.keys(validateStep1(ok1)).length === 0);

  const needDelivery = { ...ok1, delivery_same_as_site: false, delivery_address: "" };
  assert("1 delivery required when not same", !!validateStep1(needDelivery).delivery_address);
  assert("1 phone optional", !("customer_phone" in validateStep1(ok1)));

  const productLine = {
    ...createEmptyLine(),
    local_id: "l1",
    line_type: "PRODUCT" as const,
    product_id: "prod-1",
    quantity: "2",
  };
  assert("2 PRODUCT alone ok", validateStep2([productLine]).ok);

  const packageLine = {
    ...createEmptyLine(),
    local_id: "l2",
    line_type: "PACKAGE" as const,
    package_id: "pkg-1",
    product_id: "",
    quantity: "1",
  };
  assert("3 PACKAGE alone ok", validateStep2([packageLine]).ok);

  const missingTarget = { ...productLine, local_id: "l-missing", product_id: "" };
  assert("missing PRODUCT id blocks", !validateStep2([missingTarget]).ok);

  assert("4 mixed PRODUCT/PACKAGE", validateStep2([productLine, packageLine]).ok);
  assert(
    "5 multi lines",
    validateStep2([
      productLine,
      { ...packageLine, local_id: "l3" },
      { ...productLine, local_id: "l4", product_id: "prod-2" },
    ]).ok
  );

  // 価格なしでも次へ進める（登録時は価格を扱わない）
  assert("6 no price fields required", validateStep2([productLine]).ok);

  const qtyMsg = "数量は1〜9,999の整数で入力してください";
  function withQty(line: typeof productLine, quantity: string, localId: string) {
    return { ...line, local_id: localId, quantity };
  }
  assert("qty 1 PRODUCT ok", validateStep2([withQty(productLine, "1", "q1")]).ok);
  assert("qty 9999 PRODUCT ok", validateStep2([withQty(productLine, "9999", "q2")]).ok);
  assert("qty 0 PRODUCT reject", validateStep2([withQty(productLine, "0", "q3")]).lineErrors.q3?.quantity === qtyMsg);
  assert("qty -1 PRODUCT reject", validateStep2([withQty(productLine, "-1", "q4")]).lineErrors.q4?.quantity === qtyMsg);
  assert("qty 1.5 PRODUCT reject", validateStep2([withQty(productLine, "1.5", "q5")]).lineErrors.q5?.quantity === qtyMsg);
  assert("qty 10000 PRODUCT reject", validateStep2([withQty(productLine, "10000", "q6")]).lineErrors.q6?.quantity === qtyMsg);
  assert("qty empty PRODUCT reject", validateStep2([withQty(productLine, "", "q7")]).lineErrors.q7?.quantity === qtyMsg);
  assert("qty 1 PACKAGE ok", validateStep2([withQty(packageLine, "1", "q8")]).ok);
  assert("qty 9999 PACKAGE ok", validateStep2([withQty(packageLine, "9999", "q9")]).ok);
  assert("qty 0 PACKAGE reject", validateStep2([withQty(packageLine, "0", "q10")]).lineErrors.q10?.quantity === qtyMsg);
  assert("qty 1.5 PACKAGE reject", validateStep2([withQty(packageLine, "1.5", "q11")]).lineErrors.q11?.quantity === qtyMsg);
  assert("qty 10000 PACKAGE reject", validateStep2([withQty(packageLine, "10000", "q12")]).lineErrors.q12?.quantity === qtyMsg);
  assert("qty empty PACKAGE reject", validateStep2([withQty(packageLine, "", "q13")]).lineErrors.q13?.quantity === qtyMsg);
  assert("qty non-numeric reject", validateStep2([withQty(productLine, "abc", "q14")]).lineErrors.q14?.quantity === qtyMsg);

  assert(
    "settlement types match common formal set",
    SETTLEMENT_TYPES.join(",") === CASE_REGISTRATION_SETTLEMENT_TYPES.join(",")
  );
  assert(
    "settlement types are formal four",
    SETTLEMENT_TYPES.length === 4 &&
      SETTLEMENT_TYPES.join(",") === "前金,売掛,3社間決済,カード"
  );

  assert("3 settlement required", hasSettlementErrors(validateStep3(settlementOf(""))));
  assert(
    "3 前金/売掛 ok without extras",
    !hasSettlementErrors(validateStep3(settlementOf("前金"))) &&
      !hasSettlementErrors(validateStep3(settlementOf("売掛")))
  );
  assert(
    "3 3社間 requires finance + approval",
    validateStep3(settlementOf("3社間決済")).finance_company === "信販会社は必須です" &&
      validateStep3(settlementOf("3社間決済")).approval_number === "承認番号は必須です"
  );
  assert(
    "3 3社間 ok with details",
    !hasSettlementErrors(
      validateStep3(
        settlementOf("3社間決済", {
          finance_company: "オリコ",
          approval_number: "AP-1",
        })
      )
    )
  );
  assert(
    "3 カード requires brand",
    validateStep3(settlementOf("カード")).card_brand === "カード会社名は必須です"
  );
  assert(
    "3 カード ok with brand",
    !hasSettlementErrors(validateStep3(settlementOf("カード", { card_brand: "VISA" })))
  );

  const bodyMaebarai = buildGatewayBody(ok1, [productLine, packageLine], {
    settlement_type: "前金",
    finance_company: "ignored",
    approval_number: "ignored",
    card_brand: "ignored",
  });
  assert(
    "2/3/4 body has PRODUCT and PACKAGE",
    bodyMaebarai.lines[0].line_type === "PRODUCT" &&
      bodyMaebarai.lines[1].line_type === "PACKAGE"
  );
  assert(
    "gateway body omits supplier_id",
    !("supplier_id" in bodyMaebarai.lines[0]) && !("supplier_id" in bodyMaebarai.lines[1])
  );
  assert(
    "gateway body omits prices",
    !("sales_price" in bodyMaebarai.lines[0]) &&
      !("purchase_price" in bodyMaebarai.lines[0]) &&
      !("sales_price_id" in bodyMaebarai.lines[0]) &&
      !("purchase_price_id" in bodyMaebarai.lines[0])
  );
  assert(
    "前金 settlement nulls details",
    bodyMaebarai.settlement.settlement_type === "前金" &&
      bodyMaebarai.settlement.finance_company === null &&
      bodyMaebarai.settlement.approval_number === null &&
      bodyMaebarai.settlement.card_brand === null
  );

  const bodySansha = buildGatewayBody(ok1, [productLine], {
    settlement_type: "3社間決済",
    finance_company: " アプラス ",
    approval_number: " Z-9 ",
    card_brand: "should-null",
  });
  assert(
    "3社間 settlement payload",
    bodySansha.settlement.settlement_type === "3社間決済" &&
      bodySansha.settlement.finance_company === "アプラス" &&
      bodySansha.settlement.approval_number === "Z-9" &&
      bodySansha.settlement.card_brand === null
  );

  const bodyCard = buildGatewayBody(ok1, [productLine], {
    settlement_type: "カード",
    finance_company: "should-null",
    approval_number: "should-null",
    card_brand: " JCB ",
  });
  assert(
    "カード settlement payload uses card_brand",
    bodyCard.settlement.settlement_type === "カード" &&
      bodyCard.settlement.card_brand === "JCB" &&
      bodyCard.settlement.finance_company === null &&
      bodyCard.settlement.approval_number === null
  );

  assert(
    "no department/priority in body",
    !("department" in bodyMaebarai.case) && !("priority" in bodyMaebarai.case)
  );
  assert("no request_id in body", !("request_id" in bodyMaebarai));
  assert("delivery resolved from site", bodyMaebarai.case.delivery_address === "東京都");
  assert(
    "qty preserved in body",
    bodyMaebarai.lines[0].quantity === 2 && bodyMaebarai.lines[1].quantity === 1
  );

  assert(
    "11 safe error strips service role",
    safeUserErrorMessage("X", "service role key leaked") === "登録を完了できませんでした"
  );
  assert(
    "11 safe error keeps short jp",
    safeUserErrorMessage("PRICE_NOT_FOUND", "価格が見つかりません").includes("価格")
  );

  const settleUri = settlementOf("売掛");
  const fp1 = registrationFingerprint(ok1, [productLine], settleUri);
  const fp2 = registrationFingerprint(
    { ...ok1, customer_name: "顧客B" },
    [productLine],
    settleUri
  );
  const fp3 = registrationFingerprint(
    ok1,
    [productLine],
    settlementOf("3社間決済", { finance_company: "オリコ", approval_number: "1" })
  );
  assert("9 fingerprint changes on edit", fp1 !== fp2);
  assert("9 fingerprint stable", registrationFingerprint(ok1, [productLine], settleUri) === fp1);
  assert("9 fingerprint includes settlement detail", fp1 !== fp3 && fp3.includes("オリコ"));
  assert(
    "9 fingerprint omits supplier/price",
    !fp1.includes("supplier_id") && !fp1.includes("sales_unit_price")
  );

  const key1 = createIdempotencyKey();
  const key2 = createIdempotencyKey();
  assert("9 uuid-ish keys", /^[0-9a-f-]{36}$/i.test(key1) && key1 !== key2);

  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/api/auth/csrf")) {
      return {
        ok: true,
        json: async () => ({ csrfToken: "csrf-test" }),
      } as Response;
    }
    const regCount = calls.filter((c) => String(c.url).includes("case-registrations")).length;
    return {
      ok: true,
      json: async () => ({
        ok: true,
        case_id: "case-abc",
        case_no: "VE-1",
        idempotent_replay: regCount > 1,
      }),
    } as Response;
  }) as typeof fetch;

  const r1 = await submitCaseRegistration({ body: bodyMaebarai, idempotencyKey: key1 });
  const r2 = await submitCaseRegistration({ body: bodyMaebarai, idempotencyKey: key1 });
  assert(
    "7 csrf then post order",
    calls[0].url.includes("/api/auth/csrf") && calls[1].url.includes("/api/case-registrations")
  );
  const h1 = calls[1].init.headers as Record<string, string>;
  const h3 = calls[3].init.headers as Record<string, string>;
  assert("7 csrf header present", h1["X-CSRF-Token"] === "csrf-test");
  assert("9 same key resent", h1["Idempotency-Key"] === key1 && h3["Idempotency-Key"] === key1);
  assert("7 no Origin in headers", !("Origin" in h1));
  assert("10 returns case_id", r1.ok && r1.case_id === "case-abc" && r2.ok);

  const posted = JSON.parse(String(calls[1].init.body));
  assert(
    "gateway post includes settlement detail keys",
    posted.settlement &&
      "finance_company" in posted.settlement &&
      "approval_number" in posted.settlement &&
      "card_brand" in posted.settlement
  );

  globalThis.fetch = (async (url: RequestInfo | URL) => {
    if (String(url).includes("csrf")) {
      return { ok: true, json: async () => ({ csrfToken: "c" }) } as Response;
    }
    return {
      ok: false,
      status: 500,
      json: async () => ({
        ok: false,
        error_code: "REGISTRATION_FAILED",
        error_message: "SQLSTATE 23505 service_role boom",
      }),
    } as Response;
  }) as typeof fetch;

  const err = await submitCaseRegistration({ body: bodyMaebarai, idempotencyKey: key2 });
  assert(
    "11 unsafe server text scrubbed",
    !err.ok &&
      !String(err.error_message).includes("service_role") &&
      !String(err.error_message).includes("SQLSTATE")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
