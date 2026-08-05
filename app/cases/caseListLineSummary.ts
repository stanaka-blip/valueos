/**
 * 全案件一覧の商品明細集計（表示専用）。
 */
import { normalizeLineType } from "@/app/cases/[id]/productDisplay";
import { formatFirstAndOthers } from "@/app/cases/formatFirstAndOthers";

export type CaseListPackageItemInput = {
  product_id?: string | null;
  model_no_snapshot?: string | null;
  is_selected?: boolean | null;
  is_hidden?: boolean | null;
  products?:
    | { model_no?: string | null }
    | { model_no?: string | null }[]
    | null;
};

export type CaseListPackageInput = {
  case_package_items?:
    | CaseListPackageItemInput
    | CaseListPackageItemInput[]
    | null;
};

export type CaseListLineInput = {
  line_type?: string | null;
  products?:
    | {
        name?: string | null;
        model_no?: string | null;
        manufacturers?:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }
    | {
        name?: string | null;
        model_no?: string | null;
        manufacturers?:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }[]
    | null;
  packages?:
    | {
        name?: string | null;
        manufacturers?:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }
    | {
        name?: string | null;
        manufacturers?:
          | { name?: string | null }
          | { name?: string | null }[]
          | null;
      }[]
    | null;
  case_packages?:
    | CaseListPackageInput
    | CaseListPackageInput[]
    | null;
};

function getSingleRelation<T>(
  relation: T | T[] | null | undefined
): T | null {
  if (!relation) return null;
  if (Array.isArray(relation)) return relation[0] || null;
  return relation;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function manufacturerNameFromLine(line: CaseListLineInput): string {
  const lineType = normalizeLineType(line.line_type);
  if (lineType === "PACKAGE") {
    const pkg = getSingleRelation(line.packages);
    const mfr = getSingleRelation(pkg?.manufacturers);
    return (mfr?.name || "").trim();
  }
  const product = getSingleRelation(line.products);
  const mfr = getSingleRelation(product?.manufacturers);
  return (mfr?.name || "").trim();
}

function isVisiblePackageItem(item: CaseListPackageItemInput): boolean {
  if (item.is_selected === false) return false;
  if (item.is_hidden === true) return false;
  if (!item.product_id) return false;
  return true;
}

function packageItemModelNo(item: CaseListPackageItemInput): string {
  const snapshot = (item.model_no_snapshot || "").trim();
  if (snapshot) return snapshot;
  const product = getSingleRelation(item.products);
  return (product?.model_no || "").trim();
}

/**
 * PACKAGE: case_package_items.model_no_snapshot → products.model_no（構成商品）
 * PRODUCT: products.model_no
 * いずれも無ければ空（集計後に「—」）。packages.name にはフォールバックしない。
 */
function modelNoLabelsFromLine(line: CaseListLineInput): string[] {
  const lineType = normalizeLineType(line.line_type);

  if (lineType === "PACKAGE") {
    const labels: string[] = [];
    for (const casePkg of asArray(line.case_packages)) {
      for (const item of asArray(casePkg.case_package_items)) {
        if (!isVisiblePackageItem(item)) continue;
        const modelNo = packageItemModelNo(item);
        if (modelNo) labels.push(modelNo);
      }
    }
    return labels;
  }

  const product = getSingleRelation(line.products);
  const modelNo = (product?.model_no || "").trim();
  return modelNo ? [modelNo] : [];
}

/** 発注メーカー列テキスト（先頭 + 他N件） */
export function summarizeCaseManufacturers(
  lines: ReadonlyArray<CaseListLineInput>
): string {
  return formatFirstAndOthers(lines.map(manufacturerNameFromLine));
}

/** 型番列テキスト（先頭 + 他N件） */
export function summarizeCaseModelNumbers(
  lines: ReadonlyArray<CaseListLineInput>
): string {
  return formatFirstAndOthers(lines.flatMap(modelNoLabelsFromLine));
}
