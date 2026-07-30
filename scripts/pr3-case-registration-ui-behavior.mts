import {
  validateStep1,
  validateStep2,
  validateStep3,
  buildGatewayBody,
  safeUserErrorMessage,
} from "../app/components/case-registration/validation.ts";
import {
  createEmptyLine,
  createInitialCaseForm,
  registrationFingerprint,
  SETTLEMENT_TYPES,
} from "../app/components/case-registration/types.ts";
import {
  createIdempotencyKey,
  submitCaseRegistration,
} from "../app/components/case-registration/submitCaseRegistration.ts";
import { resolveDefaultSupplierId } from "../app/components/case-registration/resolveDefaultSupplier.ts";

function assert(name: string, cond: unknown, detail = "") {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exitCode = 1;
  } else {
    console.log("OK", name);
  }
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
    ...createEmptyLine("sup-1"),
    local_id: "l1",
    line_type: "PRODUCT" as const,
    product_id: "prod-1",
    quantity: "2",
    sales_unit_price: 1000,
    purchase_unit_price: 600,
    sales_found: true,
    purchase_found: true,
    price_loading: false,
    price_error: null,
  };
  assert("2 PRODUCT alone ok", validateStep2([productLine]).ok);

  const packageLine = {
    ...createEmptyLine("sup-1"),
    local_id: "l2",
    line_type: "PACKAGE" as const,
    package_id: "pkg-1",
    product_id: "",
    quantity: "1",
    sales_unit_price: 5000,
    purchase_unit_price: 3000,
    sales_found: true,
    purchase_found: true,
    price_loading: false,
    price_error: null,
  };
  assert("3 PACKAGE alone ok", validateStep2([packageLine]).ok);

  const missingSupplier = { ...productLine, local_id: "l-missing-sup", supplier_id: "" };
  const missingSupplierResult = validateStep2([missingSupplier]);
  assert("PR-C missing supplier blocks next", !missingSupplierResult.ok);
  assert(
    "PR-C missing supplier JP message",
    missingSupplierResult.lineErrors["l-missing-sup"]?.supplier_id ===
      "標準仕入先が設定されていません"
  );

  const productsMaster = [
    {
      id: "prod-1",
      name: "商品1",
      model_no: "M1",
      default_supplier_id: "sup-product",
    },
    {
      id: "prod-2",
      name: "商品2",
      model_no: null,
      default_supplier_id: null,
    },
  ];
  const packagesMaster = [
    {
      id: "pkg-1",
      name: "PKG1",
      package_code: "P1",
      default_supplier_id: "sup-package",
    },
  ];
  assert(
    "PR-C PRODUCT uses products.default_supplier_id",
    resolveDefaultSupplierId("PRODUCT", "prod-1", "", productsMaster, packagesMaster) ===
      "sup-product"
  );
  assert(
    "PR-C PACKAGE uses packages.default_supplier_id",
    resolveDefaultSupplierId("PACKAGE", "", "pkg-1", productsMaster, packagesMaster) ===
      "sup-package"
  );
  assert(
    "PR-C unset default_supplier becomes empty",
    resolveDefaultSupplierId("PRODUCT", "prod-2", "", productsMaster, packagesMaster) === ""
  );

  assert("4 mixed PRODUCT/PACKAGE", validateStep2([productLine, packageLine]).ok);
  assert(
    "5 multi lines",
    validateStep2([
      productLine,
      { ...packageLine, local_id: "l3" },
      { ...productLine, local_id: "l4", product_id: "prod-2" },
    ]).ok
  );

  const missingPrice = {
    ...productLine,
    sales_found: false,
    sales_unit_price: null,
    price_error: "販売単価が見つかりません",
  };
  assert("6 missing price blocks", !validateStep2([missingPrice]).ok);
  assert("6 missing price message", !!validateStep2([missingPrice]).lineErrors.l1?.price);

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

  assert("3 settlement required", validateStep3("") !== null);
  assert(
    "3 settlement accepts all",
    SETTLEMENT_TYPES.every((t) => validateStep3(t) === null)
  );

  const body = buildGatewayBody(ok1, [productLine, packageLine], "現金");
  assert(
    "2/3/4 body has PRODUCT and PACKAGE",
    body.lines[0].line_type === "PRODUCT" && body.lines[1].line_type === "PACKAGE"
  );
  assert(
    "PR-C gateway body sends resolved supplier_id",
    body.lines[0].supplier_id === "sup-1" && body.lines[1].supplier_id === "sup-1"
  );
  assert("no department/priority in body", !("department" in body.case) && !("priority" in body.case));
  assert("no request_id in body", !("request_id" in body));
  assert("delivery resolved from site", body.case.delivery_address === "東京都");

  assert(
    "11 safe error strips service role",
    safeUserErrorMessage("X", "service role key leaked") === "登録を完了できませんでした"
  );
  assert(
    "11 safe error keeps short jp",
    safeUserErrorMessage("PRICE_NOT_FOUND", "価格が見つかりません").includes("価格")
  );

  const fp1 = registrationFingerprint(ok1, [productLine], "現金");
  const fp2 = registrationFingerprint({ ...ok1, customer_name: "顧客B" }, [productLine], "現金");
  assert("9 fingerprint changes on edit", fp1 !== fp2);
  assert("9 fingerprint stable", registrationFingerprint(ok1, [productLine], "現金") === fp1);

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

  const r1 = await submitCaseRegistration({ body, idempotencyKey: key1 });
  const r2 = await submitCaseRegistration({ body, idempotencyKey: key1 });
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

  const err = await submitCaseRegistration({ body, idempotencyKey: key2 });
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
