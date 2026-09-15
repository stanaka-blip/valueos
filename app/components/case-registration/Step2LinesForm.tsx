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
} from "./masters";
import type { LineDraft, LineErrors, LineType } from "./types";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

type Props = {
  lines: LineDraft[];
  products: ProductOption[];
  packages: PackageOption[];
  formError: string | null;
  lineErrors: Record<string, LineErrors>;
  onChangeLine: (localId: string, patch: Partial<LineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (localId: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export default function Step2LinesForm({
  lines,
  products,
  packages,
  formError,
  lineErrors,
  onChangeLine,
  onAddLine,
  onRemoveLine,
  onBack,
  onNext,
}: Props) {
  const productOptions = useMemo(
    () =>
      products.map((p) =>
        buildProductSearchOption({
          id: p.id,
          name: p.name,
          model_no: p.model_no,
          manufacturer_name: p.manufacturer_name,
          category: p.category,
          series_name: p.series_name,
        })
      ),
    [products]
  );
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
    });
  }

  function applyProduct(localId: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    onChangeLine(localId, {
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
    });
  }

  function applyPackage(localId: string, packageId: string) {
    const p = packages.find((x) => x.id === packageId);
    onChangeLine(localId, {
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
    });
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

      {/* PC table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-600">
              <th className="p-2">種別</th>
              <th className="p-2">対象</th>
              <th className="p-2">数量</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const err = lineErrors[line.local_id] || {};
              return (
                <tr key={line.local_id} className="border-b align-top">
                  <td className="p-2">
                    <select
                      className={inputClass}
                      value={line.line_type}
                      onChange={(e) =>
                        applyLineType(line.local_id, e.target.value as LineType)
                      }
                    >
                      <option value="PRODUCT">商品</option>
                      <option value="PACKAGE">パッケージ</option>
                    </select>
                  </td>
                  <td className="p-2 min-w-[14rem]">
                    {line.line_type === "PRODUCT" ? (
                      <SearchableSelect
                        options={productOptions}
                        value={line.product_id}
                        onChange={(id) => applyProduct(line.local_id, id)}
                        placeholder="型番・商品名で検索"
                        unsetLabel="商品を検索して選択"
                      />
                    ) : (
                      <SearchableSelect
                        options={packageOptions}
                        value={line.package_id}
                        onChange={(id) => applyPackage(line.local_id, id)}
                        placeholder="パッケージ名・コードで検索"
                        unsetLabel="パッケージを検索して選択"
                      />
                    )}
                    {err.product_id || err.package_id || err.supplier_id ? (
                      <p className="mt-1 text-xs text-red-600">
                        {err.product_id || err.package_id || err.supplier_id}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-2 w-24">
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={9999}
                      step={1}
                      value={line.quantity}
                      onChange={(e) =>
                        onChangeLine(line.local_id, { quantity: e.target.value })
                      }
                    />
                    {err.quantity ? (
                      <p className="mt-1 text-xs text-red-600">{err.quantity}</p>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      className="text-sm text-red-600 disabled:opacity-40"
                      disabled={lines.length <= 1}
                      onClick={() => onRemoveLine(line.local_id)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* SP cards */}
      <div className="space-y-3 md:hidden">
        {lines.map((line) => {
          const err = lineErrors[line.local_id] || {};
          return (
            <div
              key={line.local_id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="space-y-3">
                <label className="block text-sm font-medium">
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
                <label className="block text-sm font-medium">
                  対象
                  {line.line_type === "PRODUCT" ? (
                    <div className="mt-1">
                      <SearchableSelect
                        options={productOptions}
                        value={line.product_id}
                        onChange={(id) => applyProduct(line.local_id, id)}
                        placeholder="型番・商品名で検索"
                        unsetLabel="商品を検索して選択"
                      />
                    </div>
                  ) : (
                    <div className="mt-1">
                      <SearchableSelect
                        options={packageOptions}
                        value={line.package_id}
                        onChange={(id) => applyPackage(line.local_id, id)}
                        placeholder="パッケージ名・コードで検索"
                        unsetLabel="パッケージを検索して選択"
                      />
                    </div>
                  )}
                </label>
                <label className="block text-sm font-medium">
                  数量
                  <input
                    className={`${inputClass} mt-1`}
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
                {err.product_id ||
                err.package_id ||
                err.supplier_id ||
                err.quantity ? (
                  <p className="text-sm text-red-600">
                    {err.product_id ||
                      err.package_id ||
                      err.supplier_id ||
                      err.quantity}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="text-sm text-red-600 disabled:opacity-40"
                  disabled={lines.length <= 1}
                  onClick={() => onRemoveLine(line.local_id)}
                >
                  この明細を削除
                </button>
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
