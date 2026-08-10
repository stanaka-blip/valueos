/**
 * 請求明細スナップショット（純関数）。
 * 税は請求書単位の既存ルール（calculateInvoiceAmountInclusive）を維持。
 */

import { roundMoneyTotal } from "@/lib/salesPrices";

import { calculateInvoiceAmountInclusive } from "./invoiceTax";

export type InvoiceLineKind = "product" | "package" | "custom";

export type InvoiceLineDraft = {
  key: string;
  included: boolean;
  line_kind: InvoiceLineKind;
  description: string;
  quantity: string;
  unit: string;
  unit_price_ex_tax: string;
  tax_rate: string;
  memo: string;
  case_product_id: string | null;
  source_product_id: string | null;
  source_package_id: string | null;
};

export type InvoiceLineItemInsert = {
  invoice_id: string;
  sort_order: number;
  line_kind: InvoiceLineKind;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price_ex_tax: number;
  amount_ex_tax: number;
  tax_rate: number;
  memo: string | null;
  case_product_id: string | null;
  source_product_id: string | null;
  source_package_id: string | null;
};

export type InvoiceLineItemRow = {
  id: string;
  sort_order: number;
  line_kind: InvoiceLineKind | string;
  description: string;
  quantity: number | string;
  unit: string | null;
  unit_price_ex_tax: number | string;
  amount_ex_tax: number | string;
  tax_rate: number | string | null;
  memo: string | null;
};

const DEFAULT_TAX_RATE = 0.1;

export function newInvoiceLineKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyCustomInvoiceLine(): InvoiceLineDraft {
  return {
    key: newInvoiceLineKey(),
    included: true,
    line_kind: "custom",
    description: "",
    quantity: "1",
    unit: "式",
    unit_price_ex_tax: "",
    tax_rate: String(DEFAULT_TAX_RATE),
    memo: "",
    case_product_id: null,
    source_product_id: null,
    source_package_id: null,
  };
}

export function draftAmountExTax(draft: InvoiceLineDraft): number | null {
  const qty = Number(draft.quantity);
  const unit = Number(draft.unit_price_ex_tax);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!Number.isFinite(unit)) return null;
  // 値引き（負単価）も金額として許容
  return roundMoneyTotal(unit, qty);
}

export function sumIncludedLineAmounts(
  drafts: InvoiceLineDraft[]
): number {
  let sum = 0;
  for (const d of drafts) {
    if (!d.included) continue;
    const amt = draftAmountExTax(d);
    if (amt == null) continue;
    sum += amt;
  }
  return sum;
}

export function buildInvoiceTotalsFromLines(drafts: InvoiceLineDraft[]) {
  const subtotalRaw = sumIncludedLineAmounts(drafts);
  return calculateInvoiceAmountInclusive(subtotalRaw);
}

export type ValidateInvoiceLinesResult =
  | { ok: true; lines: Omit<InvoiceLineItemInsert, "invoice_id">[] }
  | { ok: false; error_message: string };

export function validateAndBuildInvoiceLineInserts(
  drafts: InvoiceLineDraft[]
): ValidateInvoiceLinesResult {
  const included = drafts.filter((d) => d.included);
  if (included.length < 1) {
    return {
      ok: false,
      error_message: "請求明細を1件以上含めてください。",
    };
  }

  const lines: Omit<InvoiceLineItemInsert, "invoice_id">[] = [];

  for (let i = 0; i < included.length; i += 1) {
    const d = included[i];
    const description = d.description.trim();
    if (!description) {
      return {
        ok: false,
        error_message: `明細${i + 1}: 品名/摘要を入力してください。`,
      };
    }
    if (description.length > 500) {
      return {
        ok: false,
        error_message: `明細${i + 1}: 品名/摘要が長すぎます。`,
      };
    }

    const quantity = Number(d.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        ok: false,
        error_message: `明細${i + 1}: 数量は1以上で入力してください。`,
      };
    }

    const unitPrice = Number(d.unit_price_ex_tax);
    if (!Number.isFinite(unitPrice)) {
      return {
        ok: false,
        error_message: `明細${i + 1}: 単価を入力してください。`,
      };
    }

    let taxRate = DEFAULT_TAX_RATE;
    if (d.tax_rate.trim() !== "") {
      taxRate = Number(d.tax_rate);
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
        return {
          ok: false,
          error_message: `明細${i + 1}: 税率が不正です（0〜1）。`,
        };
      }
    }

    const amount = roundMoneyTotal(unitPrice, quantity);
    const kind = d.line_kind;
    if (kind !== "product" && kind !== "package" && kind !== "custom") {
      return {
        ok: false,
        error_message: `明細${i + 1}: 種別が不正です。`,
      };
    }

    lines.push({
      sort_order: i + 1,
      line_kind: kind,
      description,
      quantity,
      unit: d.unit.trim() || null,
      unit_price_ex_tax: unitPrice,
      amount_ex_tax: amount,
      tax_rate: taxRate,
      memo: d.memo.trim() || null,
      case_product_id: d.case_product_id,
      source_product_id: d.source_product_id,
      source_package_id: d.source_package_id,
    });
  }

  return { ok: true, lines };
}

export function lineKindLabel(kind: string): string {
  switch (kind) {
    case "product":
      return "商品";
    case "package":
      return "パッケージ";
    case "custom":
      return "任意";
    default:
      return kind;
  }
}

export type CaseLineSeedForInvoice = {
  caseProductId: string;
  lineType: "PRODUCT" | "PACKAGE";
  productId: string | null;
  packageId: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unitPriceExTax: number | null;
};

/** 案件商品/パッケージから請求明細ドラフトを初期化（パッケージ内は展開しない） */
export function buildInvoiceLineDraftsFromCaseSeeds(
  seeds: CaseLineSeedForInvoice[]
): InvoiceLineDraft[] {
  return seeds.map((seed) => {
    const isPackage = seed.lineType === "PACKAGE";
    const qty =
      Number.isFinite(seed.quantity) && seed.quantity > 0
        ? seed.quantity
        : 1;
    const unitPrice =
      seed.unitPriceExTax != null && Number.isFinite(seed.unitPriceExTax)
        ? String(seed.unitPriceExTax)
        : "";

    return {
      key: newInvoiceLineKey(),
      included: true,
      line_kind: isPackage ? "package" : "product",
      description: seed.description.trim() || (isPackage ? "パッケージ" : "商品"),
      quantity: String(qty),
      unit: (seed.unit || "").trim() || (isPackage ? "式" : "台"),
      unit_price_ex_tax: unitPrice,
      tax_rate: String(DEFAULT_TAX_RATE),
      memo: "",
      case_product_id: seed.caseProductId,
      source_product_id: isPackage ? null : seed.productId,
      source_package_id: isPackage ? seed.packageId : null,
    };
  });
}

/** 明細ドラフトから税スナップショット用の autofill 互換値を組み立てる */
export function buildAutofillCompatFromLineDrafts(drafts: InvoiceLineDraft[]) {
  const includedWithAmount = drafts.filter(
    (d) => d.included && draftAmountExTax(d) != null
  );
  if (includedWithAmount.length < 1) {
    return {
      subtotalExTax: 0,
      tax: 0,
      invoiceAmountInclusive: null as number | null,
      pricedCount: 0,
    };
  }
  const totals = buildInvoiceTotalsFromLines(drafts);
  return {
    subtotalExTax: totals.subtotalExTax,
    tax: totals.tax,
    invoiceAmountInclusive: totals.invoiceAmountInclusive,
    pricedCount: includedWithAmount.length,
  };
}
