"use client";

import {
  formatPackageLabel,
  formatProductLabel,
  type PackageOption,
  type ProductOption,
  type SupplierOption,
} from "./masters";
import type { LineDraft, LineErrors, LineType } from "./types";
import { lineGrossProfit, linePurchaseSubtotal, lineSalesSubtotal } from "./validation";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

function yen(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

type Props = {
  lines: LineDraft[];
  products: ProductOption[];
  packages: PackageOption[];
  suppliers: SupplierOption[];
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
  suppliers,
  formError,
  lineErrors,
  onChangeLine,
  onAddLine,
  onRemoveLine,
  onBack,
  onNext,
}: Props) {
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
              <th className="p-2">仕入先</th>
              <th className="p-2">数量</th>
              <th className="p-2">販売単価</th>
              <th className="p-2">仕入単価</th>
              <th className="p-2">販売小計</th>
              <th className="p-2">粗利</th>
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
                        onChangeLine(line.local_id, {
                          line_type: e.target.value as LineType,
                          product_id: "",
                          package_id: "",
                          display_name: "",
                        })
                      }
                    >
                      <option value="PRODUCT">商品</option>
                      <option value="PACKAGE">パッケージ</option>
                    </select>
                  </td>
                  <td className="p-2 min-w-[14rem]">
                    {line.line_type === "PRODUCT" ? (
                      <select
                        className={inputClass}
                        value={line.product_id}
                        onChange={(e) => {
                          const p = products.find((x) => x.id === e.target.value);
                          onChangeLine(line.local_id, {
                            product_id: e.target.value,
                            package_id: "",
                            display_name: p ? formatProductLabel(p) : "",
                          });
                        }}
                      >
                        <option value="">選択してください</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatProductLabel(p)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className={inputClass}
                        value={line.package_id}
                        onChange={(e) => {
                          const p = packages.find((x) => x.id === e.target.value);
                          onChangeLine(line.local_id, {
                            package_id: e.target.value,
                            product_id: "",
                            display_name: p ? formatPackageLabel(p) : "",
                          });
                        }}
                      >
                        <option value="">選択してください</option>
                        {packages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatPackageLabel(p)}
                          </option>
                        ))}
                      </select>
                    )}
                    {err.product_id || err.package_id ? (
                      <p className="mt-1 text-xs text-red-600">
                        {err.product_id || err.package_id}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-2 min-w-[10rem]">
                    <select
                      className={inputClass}
                      value={line.supplier_id}
                      onChange={(e) =>
                        onChangeLine(line.local_id, { supplier_id: e.target.value })
                      }
                    >
                      <option value="">選択してください</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {err.supplier_id ? (
                      <p className="mt-1 text-xs text-red-600">{err.supplier_id}</p>
                    ) : null}
                  </td>
                  <td className="p-2 w-24">
                    <input
                      className={inputClass}
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(e) =>
                        onChangeLine(line.local_id, { quantity: e.target.value })
                      }
                    />
                    {err.quantity ? (
                      <p className="mt-1 text-xs text-red-600">{err.quantity}</p>
                    ) : null}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {line.price_loading ? "取得中…" : yen(line.sales_unit_price)}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {line.price_loading ? "取得中…" : yen(line.purchase_unit_price)}
                  </td>
                  <td className="p-2 whitespace-nowrap">{yen(lineSalesSubtotal(line))}</td>
                  <td className="p-2 whitespace-nowrap">{yen(lineGrossProfit(line))}</td>
                  <td className="p-2">
                    <button
                      type="button"
                      className="text-sm text-red-600 disabled:opacity-40"
                      disabled={lines.length <= 1}
                      onClick={() => onRemoveLine(line.local_id)}
                    >
                      削除
                    </button>
                    {err.price || line.price_error ? (
                      <p className="mt-1 text-xs text-red-600">
                        {err.price || line.price_error}
                      </p>
                    ) : null}
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
            <div key={line.local_id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  種別
                  <select
                    className={`${inputClass} mt-1`}
                    value={line.line_type}
                    onChange={(e) =>
                      onChangeLine(line.local_id, {
                        line_type: e.target.value as LineType,
                        product_id: "",
                        package_id: "",
                        display_name: "",
                      })
                    }
                  >
                    <option value="PRODUCT">商品</option>
                    <option value="PACKAGE">パッケージ</option>
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  対象
                  {line.line_type === "PRODUCT" ? (
                    <select
                      className={`${inputClass} mt-1`}
                      value={line.product_id}
                      onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value);
                        onChangeLine(line.local_id, {
                          product_id: e.target.value,
                          package_id: "",
                          display_name: p ? formatProductLabel(p) : "",
                        });
                      }}
                    >
                      <option value="">選択してください</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {formatProductLabel(p)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className={`${inputClass} mt-1`}
                      value={line.package_id}
                      onChange={(e) => {
                        const p = packages.find((x) => x.id === e.target.value);
                        onChangeLine(line.local_id, {
                          package_id: e.target.value,
                          product_id: "",
                          display_name: p ? formatPackageLabel(p) : "",
                        });
                      }}
                    >
                      <option value="">選択してください</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {formatPackageLabel(p)}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className="block text-sm font-medium">
                  仕入先
                  <select
                    className={`${inputClass} mt-1`}
                    value={line.supplier_id}
                    onChange={(e) =>
                      onChangeLine(line.local_id, { supplier_id: e.target.value })
                    }
                  >
                    <option value="">選択してください</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  数量
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) =>
                      onChangeLine(line.local_id, { quantity: e.target.value })
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                  <div>販売単価: {line.price_loading ? "取得中…" : yen(line.sales_unit_price)}</div>
                  <div>仕入単価: {line.price_loading ? "取得中…" : yen(line.purchase_unit_price)}</div>
                  <div>販売小計: {yen(lineSalesSubtotal(line))}</div>
                  <div>仕入小計: {yen(linePurchaseSubtotal(line))}</div>
                  <div className="col-span-2 font-medium">粗利: {yen(lineGrossProfit(line))}</div>
                </div>
                {err.price ||
                line.price_error ||
                err.product_id ||
                err.package_id ||
                err.supplier_id ||
                err.quantity ? (
                  <p className="text-sm text-red-600">
                    {err.price ||
                      line.price_error ||
                      err.product_id ||
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
