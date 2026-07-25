"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import {
  listOrderItemsByOrderId,
  replaceOrderItemsForOrder,
} from "@/lib/repositories/orderItems";
import {
  getCaseStatusFromOrderStatus,
  PURCHASE_ORDER_STATUSES,
  resolveDeliveredDate,
} from "@/app/orders/orderConstants";
import {
  calcLineAmount,
  formatYen,
  getTodayString,
  isUuid,
  toNumber,
} from "@/app/orders/orderUtils";

type LineDraft = {
  id: string | null;
  local_id: string;
  product_id: string;
  case_product_id: string | null;
  product_name: string;
  model_no: string;
  quantity: string;
  unit_price: string;
  memo: string;
};

type OrderForm = {
  expected_delivery_date: string;
  status: string;
  memo: string;
  delivered_date: string | null;
  case_id: string | null;
  order_no: string;
};

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id || "";

  const [form, setForm] = useState<OrderForm>({
    expected_delivery_date: "",
    status: "発注済",
    memo: "",
    delivered_date: null,
    case_id: null,
    order_no: "",
  });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const orderAmount = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          calcLineAmount(toNumber(line.quantity), toNumber(line.unit_price)),
        0
      ),
    [lines]
  );

  useEffect(() => {
    if (!orderId || !isUuid(orderId)) {
      setLoadError("発注IDが不正です。");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select(
          `
          id,
          case_id,
          order_no,
          expected_delivery_date,
          delivered_date,
          status,
          memo
        `
        )
        .eq("id", orderId)
        .single();

      if (cancelled) {
        return;
      }

      if (orderError || !order) {
        setLoadError(orderError?.message || "発注が見つかりません。");
        setLoading(false);
        return;
      }

      const itemsResult = await listOrderItemsByOrderId(orderId);
      if (cancelled) {
        return;
      }

      if (itemsResult.error) {
        setLoadError(itemsResult.error);
        setLoading(false);
        return;
      }

      const productIds = itemsResult.data
        .map((item) => item.product_id)
        .filter((value): value is string => Boolean(value));

      const productMap = new Map<
        string,
        { name: string | null; model_no: string | null }
      >();

      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, name, model_no")
          .in("id", productIds);

        for (const product of products || []) {
          productMap.set(product.id as string, {
            name: (product.name as string | null) || null,
            model_no: (product.model_no as string | null) || null,
          });
        }
      }

      if (cancelled) {
        return;
      }

      setForm({
        expected_delivery_date: (order.expected_delivery_date as string) || "",
        status: (order.status as string) || "発注済",
        memo: (order.memo as string) || "",
        delivered_date: (order.delivered_date as string | null) || null,
        case_id: (order.case_id as string | null) || null,
        order_no: (order.order_no as string) || "",
      });

      setLines(
        itemsResult.data.map((item) => {
          const product = item.product_id
            ? productMap.get(item.product_id)
            : null;
          return {
            id: item.id,
            local_id: item.id,
            product_id: item.product_id || "",
            case_product_id: item.case_product_id,
            product_name: product?.name || "名称未設定",
            model_no: product?.model_no || "",
            quantity: String(toNumber(item.quantity) || 1),
            unit_price: String(toNumber(item.unit_price)),
            memo: item.memo || "",
          };
        })
      );
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  function handleChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleLineChange(
    localId: string,
    field: "quantity" | "unit_price" | "memo",
    value: string
  ) {
    setLines((current) =>
      current.map((line) =>
        line.local_id === localId ? { ...line, [field]: value } : line
      )
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (submitting) {
      return;
    }

    if (lines.length === 0) {
      setSubmitError("発注明細がありません。");
      return;
    }

    for (const line of lines) {
      if (toNumber(line.quantity) <= 0) {
        setSubmitError("数量は1以上で入力してください。");
        return;
      }
      if (toNumber(line.unit_price) < 0) {
        setSubmitError("単価は0以上で入力してください。");
        return;
      }
    }

    setSubmitting(true);
    const today = getTodayString();
    const deliveredDate = resolveDeliveredDate(
      form.status,
      form.delivered_date,
      today
    );

    const { error: orderError } = await supabase
      .from("orders")
      .update({
        expected_delivery_date: form.expected_delivery_date || null,
        status: form.status,
        memo: form.memo.trim() || null,
        delivered_date: deliveredDate,
        order_amount: orderAmount,
      })
      .eq("id", orderId);

    if (orderError) {
      setSubmitError(`発注の更新に失敗しました：${orderError.message}`);
      setSubmitting(false);
      return;
    }

    const itemsResult = await replaceOrderItemsForOrder(
      orderId,
      lines.map((line, index) => {
        const quantity = toNumber(line.quantity);
        const unitPrice = toNumber(line.unit_price);
        return {
          product_id: line.product_id || null,
          case_product_id: line.case_product_id,
          quantity,
          unit_price: unitPrice,
          amount: calcLineAmount(quantity, unitPrice),
          memo: line.memo.trim() || null,
          sort_order: index,
        };
      })
    );

    if (itemsResult.error) {
      setSubmitError(`発注明細の更新に失敗しました：${itemsResult.error}`);
      setSubmitting(false);
      return;
    }

    const nextCaseStatus = getCaseStatusFromOrderStatus(form.status);
    if (nextCaseStatus && form.case_id) {
      const { error: caseStatusError } = await supabase
        .from("cases")
        .update({ status: nextCaseStatus })
        .eq("id", form.case_id);

      if (caseStatusError) {
        window.alert(
          `発注は更新されましたが、案件ステータスの更新に失敗しました。\n${caseStatusError.message}`
        );
      }
    }

    setSubmitting(false);
    router.push(`/orders/${orderId}`);
    router.refresh();
  }

  if (loading) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">発注編集</h1>
        </header>
        <main className="p-4 md:p-8">
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            読み込み中...
          </div>
        </main>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">発注編集</h1>
        </header>
        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {loadError}
            <div className="mt-4">
              <Link
                href="/cases"
                className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700"
              >
                案件一覧へ
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <h1 className="text-2xl font-bold text-gray-900">
          発注編集：{form.order_no || "-"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          数量・単価・ステータス・納品予定日・備考を変更できます。
        </p>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <div>
          <Link
            href={`/orders/${orderId}`}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 発注詳細へ戻る
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl bg-white p-5 shadow-sm md:p-8"
        >
          {submitError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="発注ステータス" required>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              >
                {PURCHASE_ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="納品予定日">
              <input
                type="date"
                name="expected_delivery_date"
                value={form.expected_delivery_date}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="発注金額（明細合計）">
              <p className="rounded-lg border border-gray-200 bg-[#f7f7f5] px-4 py-3 text-right text-sm font-semibold">
                {formatYen(orderAmount)}
              </p>
            </Field>
          </div>

          <div>
            <h3 className="mb-3 text-base font-bold text-gray-900">発注明細</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-[#f7f7f5] text-gray-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">商品</th>
                    <th className="px-3 py-3 font-medium">型番</th>
                    <th className="px-3 py-3 font-medium">数量</th>
                    <th className="px-3 py-3 font-medium">単価</th>
                    <th className="px-3 py-3 font-medium">金額</th>
                    <th className="px-3 py-3 font-medium">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.local_id} className="border-b last:border-b-0">
                      <td className="px-3 py-3">{line.product_name}</td>
                      <td className="px-3 py-3">{line.model_no || "-"}</td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) =>
                            handleLineChange(
                              line.local_id,
                              "quantity",
                              e.target.value
                            )
                          }
                          disabled={submitting}
                          className={`${inputClassName} w-24`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={line.unit_price}
                          onChange={(e) =>
                            handleLineChange(
                              line.local_id,
                              "unit_price",
                              e.target.value
                            )
                          }
                          disabled={submitting}
                          className={`${inputClassName} w-32 text-right`}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatYen(
                          calcLineAmount(
                            toNumber(line.quantity),
                            toNumber(line.unit_price)
                          )
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={line.memo}
                          onChange={(e) =>
                            handleLineChange(
                              line.local_id,
                              "memo",
                              e.target.value
                            )
                          }
                          disabled={submitting}
                          className={inputClassName}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Field label="備考">
            <textarea
              name="memo"
              value={form.memo}
              onChange={handleChange}
              rows={4}
              disabled={submitting}
              className={inputClassName}
            />
          </Field>

          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <Link
              href={`/orders/${orderId}`}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting ? "保存しています..." : "変更を保存"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-700">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
