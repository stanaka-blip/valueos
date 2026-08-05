/**
 * 全案件一覧の商品明細集計（表示専用）。
 */
import { normalizeLineType } from "@/app/cases/[id]/productDisplay";
import { formatFirstAndOthers } from "@/app/cases/formatFirstAndOthers";

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
};

function getSingleRelation<T>(
  relation: T | T[] | null | undefined
): T | null {
  if (!relation) return null;
  if (Array.isArray(relation)) return relation[0] || null;
  return relation;
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

/**
 * 型番列: products.model_no を優先。
 * PACKAGE で model_no が無い場合のみ商品名（packages.name / products.name）へフォールバック。
 */
function modelNoLabelFromLine(line: CaseListLineInput): string {
  const lineType = normalizeLineType(line.line_type);
  const product = getSingleRelation(line.products);
  const pkg = getSingleRelation(line.packages);
  const modelNo = (product?.model_no || "").trim();
  if (modelNo) return modelNo;

  if (lineType === "PACKAGE") {
    return (pkg?.name || product?.name || "").trim();
  }
  return (product?.name || "").trim();
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
  return formatFirstAndOthers(lines.map(modelNoLabelFromLine));
}
