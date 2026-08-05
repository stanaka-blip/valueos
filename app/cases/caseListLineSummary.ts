/**
 * 全案件一覧の商品明細集計（表示専用）。
 */
import {
  normalizeLineType,
  resolveDisplayName,
} from "@/app/cases/[id]/productDisplay";
import { formatFirstAndOthers } from "@/app/cases/formatFirstAndOthers";

export type CaseListLineInput = {
  line_type?: string | null;
  products?:
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

function productLabelFromLine(line: CaseListLineInput): string {
  const lineType = normalizeLineType(line.line_type);
  const product = getSingleRelation(line.products);
  const pkg = getSingleRelation(line.packages);
  return resolveDisplayName(lineType, product?.name, pkg?.name);
}

/** 発注メーカー列テキスト（先頭 + 他N件） */
export function summarizeCaseManufacturers(
  lines: ReadonlyArray<CaseListLineInput>
): string {
  return formatFirstAndOthers(lines.map(manufacturerNameFromLine));
}

/** 商材列テキスト（先頭 + 他N件） */
export function summarizeCaseProducts(
  lines: ReadonlyArray<CaseListLineInput>
): string {
  return formatFirstAndOthers(lines.map(productLabelFromLine));
}
