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

import { parseCaseExtras } from "@/app/admin/orders/parseCaseExtras";
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
import {
  displayIdentityValue,
  resolveProductIdentity,
} from "@/app/orders/productIdentity";
import {
  containsPackageMemoMarker,
  displaySafeOrderItemMemo,
} from "@/lib/orders/orderPackageDisplay";

type LineDraft = {
  id: string | null;
  local_id: string;
  product_id: string;
  case_product_id: string | null;
  manufacturer_name: string;
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

type DeliveryConfirmInfo = {
  customerName: string;
  deliveryName: string;
  deliveryAddress: string;
  receiverPhone: string;
  receiverName: string;
};

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id || "";

  const orderIdError =
    !orderId || !isUuid(orderId) ? "発注IDが不正です。" : "";

  const [form, setForm] = useState<OrderForm>({
    expected_delivery_date: "",
    status: "発注済",
    memo: "",
    delivered_date: null,
    case_id: null,
    order_no: "",
  });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [headerOrderAmount, setHeaderOrderAmount] = useState(0);
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryConfirmInfo | null>(
    null
  );
  const [loading, setLoading] = useState(!orderIdError);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(orderIdError);
  const [submitError, setSubmitError] = useState("");

  const linesTotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          calcLineAmount(toNumber(line.quantity), toNumber(line.unit_price)),
        0
      ),
    [lines]
  );

  /**
   * 明細があるときは明細合計を正とする。
   * 明細が空の旧発注では orders.order_amount を表示フォールバックする。
   */
  const displayedOrderAmount =
    lines.length > 0 ? linesTotal : headerOrderAmount;

  useEffect(() => {
    if (orderIdError) {
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
          order_amount,
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

      const caseId = (order.case_id as string | null) || null;
      let nextDelivery: DeliveryConfirmInfo | null = null;

      if (caseId) {
        const { data: caseRow, error: caseError } = await supabase
          .from("cases")
          .select(
            "id, customer_name, delivery_address, site_address, memo"
          )
          .eq("id", caseId)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (caseError) {
          setLoadError(
            `案件（納品先）情報の取得に失敗しました：${caseError.message}`
          );
          setLoading(false);
          return;
        }

        if (caseRow) {
          const extras = parseCaseExtras({
            memo: (caseRow.memo as string | null) || null,
            constructionDetail: null,
          });
          const deliveryAddress =
            String(caseRow.delivery_address || "").trim() ||
            String(caseRow.site_address || "").trim();

          nextDelivery = {
            customerName: String(caseRow.customer_name || "").trim(),
            deliveryName: (extras.deliveryName || "").trim(),
            deliveryAddress,
            receiverPhone: (extras.receiverPhone || "").trim(),
            receiverName: (extras.receiverName || "").trim(),
          };
        }
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
        { manufacturer_name: string; model_no: string }
      >();

      if (productIds.length > 0) {
        const { data: products, error: productsError } = await supabase
          .from("products")
          .select("id, model_no, manufacturers(name)")
          .in("id", productIds);

        if (cancelled) {
          return;
        }

        if (productsError) {
          setLoadError(
            `商品情報の取得に失敗しました：${productsError.message}`
          );
          setLoading(false);
          return;
        }

        for (const product of products || []) {
          const identity = resolveProductIdentity(
            product as {
              model_no?: string | null;
              manufacturers?:
                | { name?: string | null }
                | { name?: string | null }[]
                | null;
            }
          );
          productMap.set(product.id as string, {
            manufacturer_name: identity.manufacturerName,
            model_no: identity.modelNo,
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
        case_id: caseId,
        order_no: (order.order_no as string) || "",
      });
      setHeaderOrderAmount(toNumber(order.order_amount));
      setDeliveryInfo(nextDelivery);

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
            manufacturer_name: product?.manufacturer_name || "",
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
  }, [orderId, orderIdError]);

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
      setSubmitError(
        "発注明細がありません。明細がない発注は金額・納品状態を保存できません。"
      );
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
        order_amount: linesTotal,
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
          納品確認・ステータス変更、および数量・単価・納品予定日・備考を更新できます。
        </p>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/queues/deliveries"
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 納品管理へ戻る
          </Link>
          <Link
            href={`/orders/${orderId}`}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 発注詳細へ戻る
          </Link>
        </div>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">納品先（確認）</h2>
          <p className="mb-4 text-sm text-gray-500">
            案件情報の読取専用表示です。ここからは編集できません。
          </p>
          {deliveryInfo ? (
            <div className="grid gap-5 md:grid-cols-2">
              {/*
                「納品先名」の単一正式定義は未確定のため、
                納品書と同じく顧客名を表示する。
                dealer 案件の【納品先名称】がある場合のみ併記する。
              */}
              <Info label="顧客名" value={deliveryInfo.customerName} />
              {deliveryInfo.deliveryName ? (
                <Info label="納品先名称" value={deliveryInfo.deliveryName} />
              ) : null}
              <Info
                label="納品先住所"
                value={deliveryInfo.deliveryAddress}
                className="md:col-span-2"
              />
              <Info label="納品先電話番号" value={deliveryInfo.receiverPhone} />
              <Info label="荷受け担当者" value={deliveryInfo.receiverName} />
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              案件に紐づく納品先情報を表示できません。
            </div>
          )}
        </section>

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

            <Field
              label={
                lines.length > 0
                  ? "発注金額（明細合計）"
                  : "発注金額（ヘッダ）"
              }
            >
              <p className="rounded-lg border border-gray-200 bg-[#f7f7f5] px-4 py-3 text-right text-sm font-semibold">
                {formatYen(displayedOrderAmount)}
              </p>
              {lines.length === 0 && headerOrderAmount > 0 ? (
                <p className="mt-2 text-xs text-amber-800">
                  明細が無いため、発注ヘッダの金額を表示しています。
                </p>
              ) : null}
            </Field>
          </div>

          <div>
            <h3 className="mb-3 text-base font-bold text-gray-900">発注明細</h3>
            {lines.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                発注明細がありません。旧データで明細が未作成の可能性があります。発注詳細・発注書も合わせて確認してください。
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b bg-[#f7f7f5] text-gray-500">
                    <tr>
                      <th className="px-3 py-3 font-medium">メーカー</th>
                      <th className="px-3 py-3 font-medium">型番</th>
                      <th className="px-3 py-3 font-medium">数量</th>
                      <th className="px-3 py-3 font-medium">仕入単価</th>
                      <th className="px-3 py-3 font-medium">金額</th>
                      <th className="px-3 py-3 font-medium">備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr
                        key={line.local_id}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-3 py-3">
                          {displayIdentityValue(line.manufacturer_name)}
                        </td>
                        <td className="px-3 py-3">
                          {displayIdentityValue(line.model_no)}
                        </td>
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
                          {containsPackageMemoMarker(line.memo) ? (
                            <span className="text-xs text-gray-500">
                              {displaySafeOrderItemMemo(line.memo) || "—"}
                            </span>
                          ) : (
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
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              disabled={submitting || lines.length === 0}
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

function Info({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-gray-900">
        {value || "—"}
      </p>
    </div>
  );
}
