"use client";

import {
  draftAmountExTax,
  emptyCustomInvoiceLine,
  lineKindLabel,
  type InvoiceLineDraft,
} from "@/lib/invoices/invoiceLineItems";

type Props = {
  lines: InvoiceLineDraft[];
  onChange: (lines: InvoiceLineDraft[]) => void;
  disabled?: boolean;
};

function updateLine(
  lines: InvoiceLineDraft[],
  key: string,
  patch: Partial<InvoiceLineDraft>
): InvoiceLineDraft[] {
  return lines.map((line) =>
    line.key === key ? { ...line, ...patch } : line
  );
}

export default function InvoiceLineEditor({ lines, onChange, disabled }: Props) {
  const addCustom = () => {
    onChange([...lines, emptyCustomInvoiceLine()]);
  };

  const removeCustom = (key: string) => {
    onChange(lines.filter((line) => line.key !== key));
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">対象</th>
              <th className="px-3 py-2 font-medium">種別</th>
              <th className="px-3 py-2 font-medium">品名/摘要</th>
              <th className="px-3 py-2 font-medium text-right">数量</th>
              <th className="px-3 py-2 font-medium">単位</th>
              <th className="px-3 py-2 font-medium text-right">単価（税抜）</th>
              <th className="px-3 py-2 font-medium text-right">金額（税抜）</th>
              <th className="px-3 py-2 font-medium">税率</th>
              <th className="px-3 py-2 font-medium">備考</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  明細がありません。「任意明細を追加」から追加できます。
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                const amount = draftAmountExTax(line);
                return (
                  <tr
                    key={line.key}
                    className={line.included ? "bg-white" : "bg-slate-50 opacity-70"}
                  >
                    <td className="px-3 py-2 align-top">
                      <label className="inline-flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={line.included}
                          disabled={disabled}
                          onChange={(e) =>
                            onChange(
                              updateLine(lines, line.key, {
                                included: e.target.checked,
                              })
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="text-xs">請求</span>
                      </label>
                      {line.line_kind === "custom" && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => removeCustom(line.key)}
                          className="mt-2 block text-xs text-rose-600 hover:underline disabled:opacity-50"
                        >
                          削除
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-600">
                      {lineKindLabel(line.line_kind)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={line.description}
                        disabled={disabled || !line.included}
                        onChange={(e) =>
                          onChange(
                            updateLine(lines, line.key, {
                              description: e.target.value,
                            })
                          )
                        }
                        className="w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100"
                        placeholder="品名/摘要"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.quantity}
                        disabled={disabled || !line.included}
                        onChange={(e) =>
                          onChange(
                            updateLine(lines, line.key, {
                              quantity: e.target.value,
                            })
                          )
                        }
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={line.unit}
                        disabled={disabled || !line.included}
                        onChange={(e) =>
                          onChange(
                            updateLine(lines, line.key, {
                              unit: e.target.value,
                            })
                          )
                        }
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100"
                        placeholder="式"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="1"
                        value={line.unit_price_ex_tax}
                        disabled={disabled || !line.included}
                        onChange={(e) =>
                          onChange(
                            updateLine(lines, line.key, {
                              unit_price_ex_tax: e.target.value,
                            })
                          )
                        }
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-right font-medium text-slate-800">
                      {amount != null ? amount.toLocaleString("ja-JP") : "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-600">
                      {`${Math.round(Number(line.tax_rate || 0.1) * 100)}%`}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={line.memo}
                        disabled={disabled || !line.included}
                        onChange={(e) =>
                          onChange(
                            updateLine(lines, line.key, {
                              memo: e.target.value,
                            })
                          )
                        }
                        className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-100"
                        placeholder="明細備考"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={addCustom}
        className="rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        任意明細を追加（輸送費・調整費など）
      </button>
      <p className="text-xs text-slate-500">
        パッケージは内部商品を展開せず、パッケージ名で1行表示します。任意明細は商品マスタ不要です。
      </p>
    </div>
  );
}
