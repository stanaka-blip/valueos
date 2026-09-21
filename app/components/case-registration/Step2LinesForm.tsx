"use client";

import { useMemo } from "react";

import SearchableSelect from "@/app/components/masters/SearchableSelect";
import {
  buildPackageSearchOption,
  buildProductSearchOption,
} from "@/app/components/masters/searchableSelect";
import {
  formatPackageLabel,
  formatProductLabel,
  resolveDefaultSupplierId,
  type PackageOption,
  type ProductOption,
  type SupplierOption,
} from "./masters";
import { emptyLinePriceFields, patchOnSupplierChange } from "./linePriceResolve";
import type { LineDraft, LineErrors, LineType } from "./types";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

type Props = {
  lines: LineDraft[];
  products: ProductOption[];
  packages: PackageOption[];
  suppliers: SupplierOption[];
  formError: string | null;
  lineErrors: Record<string, LineErrors>;
  priceLoadingIds: ReadonlySet<string>;
  onChangeLine: (localId: string, patch: Partial<LineDraft>) => void;
  onProductSelected: (localId: string, productId: string) => void;
  onPackageSelected: (localId: string, packageId: string) => void;
  onSupplierSelected: (localId: string, supplierId: string) => void;
  onAddLine: () => void;
  onRemoveLine: (localId: string) => void;
  onBack: () => void;
  onNext: () => void;
};

function formatYenDisplay(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  return `${n.toLocaleString("ja-JP")}円`;
}

export default function Step2LinesForm({
  lines,
  products,
  packages,
  suppliers,
  formError,
  lineErrors,
  priceLoadingIds,
  onChangeLine,
  onProductSelected,
  onPackageSelected,
  onSupplierSelected,
  onAddLine,
  onRemoveLine,
  onBack,
  onNext,
}: Props) {
  function productOptionsForLine(line: LineDraft) {
    return products
      .filter((p) => {
        if (p.id === line.product_id) return true;
        // 利用停止表示付き name は再開用。新規選択は active のみ（名前に利用停止を含まない）
        return !String(p.name || "").includes("（利用停止）");
      })
      .map((p) =>
        buildProductSearchOption({
          id: p.id,
          name: p.name,
          model_no: p.model_no,
          manufacturer_name: p.manufacturer_name,
          category: p.category,
          series_name: p.series_name,
        })
      );
  }
  const packageOptions = useMemo(
    () =>
      packages.map((p) =>
        buildPackageSearchOption({
          id: p.id,
          name: p.name,
          package_code: p.package_code,
        })
      ),
    [packages]
  );

  function applyLineType(localId: string, lineType: LineType) {
    onChangeLine(localId, {
      line_type: lineType,
      product_id: "",
      package_id: "",
      supplier_id: "",
      display_name: "",
      ...emptyLinePriceFields(),
    });
  }

  function supplierName(id: string): string {
    return suppliers.find((s) => s.id === id)?.name || "";
  }

  function renderLineFields(line: LineDraft, err: LineErrors) {
    const loading = priceLoadingIds.has(line.local_id);
    return (
      <>
        <label className="block text-sm font-medium">
          標準仕入先
          <select
            className={`${inputClass} mt-1`}
            value={line.supplier_id}
            disabled={
              (line.line_type === "PRODUCT" && !line.product_id) ||
              (line.line_type === "PACKAGE" && !line.package_id)
            }
            onChange={(e) => onSupplierSelected(line.local_id, e.target.value)}
          >
            <option value="">仕入先を選択</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {line.line_type === "PRODUCT" &&
                products.find((p) => p.id === line.product_id)
                  ?.default_supplier_id === s.id
                  ? "（標準）"
                  : ""}
                {line.line_type === "PACKAGE" &&
                packages.find((p) => p.id === line.package_id)
                  ?.default_supplier_id === s.id
                  ? "（標準）"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        {err.supplier_id ? (
          <p className="text-xs text-red-600">{err.supplier_id}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            仕入単価
            <input
              className={`${inputClass} mt-1`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder={loading ? "取得中…" : "未設定"}
              value={line.purchase_price}
              onChange={(e) =>
                onChangeLine(line.local_id, {
                  purchase_price: e.target.value,
                  purchase_price_is_manual: true,
                  purchase_price_unset: false,
                })
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              {loading
                ? "価格を取得しています…"
                : line.purchase_price_unset && !line.purchase_price
                  ? "仕入価格未設定（手入力可）"
                  : line.purchase_price
                    ? `表示: ${formatYenDisplay(line.purchase_price)}${
                        line.purchase_price_is_manual ? "・手入力" : ""
                      }`
                    : line.supplier_id
                      ? "仕入先選択後に自動反映"
                      : "仕入先を選択してください"}
            </p>
          </label>
          <label className="block text-sm font-medium">
            販売単価
            <input
              className={`${inputClass} mt-1 bg-gray-50`}
              type="text"
              readOnly
              value={
                loading
                  ? "取得中…"
                  : line.sales_price
                    ? formatYenDisplay(line.sales_price)
                    : line.sales_price_unset
                      ? "販売価格未設定"
                      : ""
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              販売店×商品のマスタ価格（参考）
            </p>
          </label>
        </div>
        {err.purchase_price ? (
          <p className="text-xs text-red-600">{err.purchase_price}</p>
        ) : null}
        {!err.supplier_id &&
        line.supplier_id &&
        supplierName(line.supplier_id) ? (
          <p className="text-xs text-gray-500">
            選択中: {supplierName(line.supplier_id)}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      noValidate
    >
      {formError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {formError}
        </div>
      ) : null}

      <div className="space-y-4">
        {lines.map((line) => {
          const err = lineErrors[line.local_id] || {};
          return (
            <div
              key={line.local_id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label className="block min-w-[8rem] flex-1 text-sm font-medium">
                    種別
                    <select
                      className={`${inputClass} mt-1`}
                      value={line.line_type}
                      onChange={(e) =>
                        applyLineType(line.local_id, e.target.value as LineType)
                      }
                    >
                      <option value="PRODUCT">商品</option>
                      <option value="PACKAGE">パッケージ</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="mt-6 text-sm text-red-600 disabled:opacity-40"
                    disabled={lines.length <= 1}
                    onClick={() => onRemoveLine(line.local_id)}
                  >
                    削除
                  </button>
                </div>

                <label className="block text-sm font-medium">
                  {line.line_type === "PRODUCT" ? "商品" : "パッケージ"}
                  <div className="mt-1">
                    {line.line_type === "PRODUCT" ? (
                      <SearchableSelect
                        options={productOptionsForLine(line)}
                        value={line.product_id}
                        onChange={(id) => onProductSelected(line.local_id, id)}
                        placeholder="型番・商品名で検索"
                        unsetLabel="商品を検索して選択"
                      />
                    ) : (
                      <SearchableSelect
                        options={packageOptions}
                        value={line.package_id}
                        onChange={(id) => onPackageSelected(line.local_id, id)}
                        placeholder="パッケージ名・コードで検索"
                        unsetLabel="パッケージを検索して選択"
                      />
                    )}
                  </div>
                </label>
                {err.product_id || err.package_id ? (
                  <p className="text-xs text-red-600">
                    {err.product_id || err.package_id}
                  </p>
                ) : null}

                {renderLineFields(line, err)}

                <label className="block text-sm font-medium">
                  数量
                  <input
                    className={`${inputClass} mt-1 w-32`}
                    type="number"
                    min={1}
                    max={9999}
                    step={1}
                    value={line.quantity}
                    onChange={(e) =>
                      onChangeLine(line.local_id, { quantity: e.target.value })
                    }
                  />
                </label>
                {err.quantity ? (
                  <p className="text-xs text-red-600">{err.quantity}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAddLine}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
      >
        明細を追加
      </button>

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm"
        >
          戻る
        </button>
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          次へ
        </button>
      </div>
    </form>
  );
}

/** テスト・他画面向け: 商品選択時の default supplier 解決（副作用なし） */
export function buildProductLinePatch(
  productId: string,
  products: ProductOption[],
  packages: PackageOption[]
): Partial<LineDraft> {
  const p = products.find((x) => x.id === productId);
  return {
    product_id: productId,
    package_id: "",
    supplier_id: resolveDefaultSupplierId(
      "PRODUCT",
      productId,
      "",
      products,
      packages
    ),
    display_name: p ? formatProductLabel(p) : "",
    purchase_price_is_manual: false,
  };
}

export function buildPackageLinePatch(
  packageId: string,
  products: ProductOption[],
  packages: PackageOption[]
): Partial<LineDraft> {
  const p = packages.find((x) => x.id === packageId);
  return {
    package_id: packageId,
    product_id: "",
    supplier_id: resolveDefaultSupplierId(
      "PACKAGE",
      "",
      packageId,
      products,
      packages
    ),
    display_name: p ? formatPackageLabel(p) : "",
    purchase_price_is_manual: false,
  };
}

export function buildSupplierChangePatch(
  supplierId: string,
  line: LineDraft
): Partial<LineDraft> {
  return {
    supplier_id: supplierId,
    ...patchOnSupplierChange({
      purchase_price_is_manual: line.purchase_price_is_manual,
      purchase_price: line.purchase_price,
    }),
  };
}
