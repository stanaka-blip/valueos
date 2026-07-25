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

import { fetchActivePurchaseUnitPrices } from "@/lib/purchasePrices";
import { insertOrderItems } from "@/lib/repositories/orderItems";
import { supabase } from "@/lib/supabase";

import {
  getCaseStatusFromOrderStatus,
  PURCHASE_ORDER_STATUSES,
  resolveDeliveredDate,
} from "@/app/orders/orderConstants";
import {
  calcLineAmount,
  formatDate,
  formatYen,
  generateOrderNumber,
  getTodayString,
  isUuid,
  toNumber,
} from "@/app/orders/orderUtils";

type Supplier = {
  id: string;
  name: string | null;
};

type DealerRelationItem = {
  default_supplier_id: string | null;
};

type CaseRelation = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  order_type: string | null;
  desired_delivery_date: string | null;
  dealers: DealerRelationItem | DealerRelationItem[] | null;
};

type LineDraft = {
  local_id: string;
  product_id: string;
  case_product_id: string | null;
  product_name: string;
  model_no: string;
  quantity: string;
  unit_price: string;
  memo: string;
  sort_order: number;
  /** 案件スナップショットから正の単価が取れたか（フォールバック対象外） */
  has_case_snapshot: boolean;
};

type OrderForm = {
  supplier_id: string;
  order_no: string;
  order_date: string;
  expected_delivery_date: string;
  status: string;
  memo: string;
};

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

export default function NewOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const caseId = params?.id || "";

  const caseIdError = !caseId
    ? "案件IDを取得できませんでした。"
    : !isUuid(caseId)
      ? "案件IDの形式が正しくありません。案件一覧から開き直してください。"
      : "";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [caseData, setCaseData] = useState<CaseRelation | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [initialLoading, setInitialLoading] = useState(!caseIdError);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(caseIdError);
  const [submitError, setSubmitError] = useState("");
  const [form, setForm] = useState<OrderForm>({
    supplier_id: "",
    order_no: "",
    order_date: getTodayString(),
    expected_delivery_date: "",
    status: "発注済",
    memo: "",
  });

  const orderAmount = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = toNumber(line.quantity);
        const unit = toNumber(line.unit_price);
        return sum + calcLineAmount(qty, unit);
      }, 0),
    [lines]
  );

  useEffect(() => {
    if (caseIdError) {
      return;
    }

    let cancelled = false;

    async function fetchInitialData() {
      setInitialLoading(true);
      setLoadError("");

      const [
        { data: supplierData, error: supplierError },
        { data: rawCaseData, error: caseError },
        { data: rawCaseProducts, error: caseProductsError },
        { data: rawCasePackages, error: casePackagesError },
      ] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("cases")
          .select(
            `
            id,
            case_no,
            customer_name,
            order_type,
            desired_delivery_date,
            dealers (
              default_supplier_id
            )
          `
          )
          .eq("id", caseId)
          .single(),
        supabase
          .from("case_products")
          .select(
            `
            id,
            product_id,
            quantity,
            purchase_price,
            memo,
            products (
              name,
              model_no
            )
          `
          )
          .eq("case_id", caseId)
          .order("created_at", { ascending: true }),
        supabase
          .from("case_packages")
          .select(
            `
            id,
            case_package_items (
              id,
              product_id,
              quantity,
              unit_purchase_price,
              total_purchase_price,
              memo,
              is_selected,
              is_hidden,
              sort_order,
              product_name_snapshot,
              model_no_snapshot,
              display_name_snapshot,
              products (
                name,
                model_no
              )
            )
          `
          )
          .eq("case_id", caseId)
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) {
        return;
      }

      if (supplierError) {
        setLoadError(`仕入先の取得に失敗しました：${supplierError.message}`);
        setInitialLoading(false);
        return;
      }

      if (caseError || !rawCaseData) {
        setLoadError(
          `案件情報の取得に失敗しました：${
            caseError?.message || "案件が見つかりませんでした"
          }`
        );
        setInitialLoading(false);
        return;
      }

      if (caseProductsError) {
        setLoadError(
          `案件商品の取得に失敗しました：${caseProductsError.message}`
        );
        setInitialLoading(false);
        return;
      }

      if (casePackagesError) {
        setLoadError(
          `パッケージ明細の取得に失敗しました：${casePackagesError.message}`
        );
        setInitialLoading(false);
        return;
      }

      const normalizedCase = rawCaseData as unknown as CaseRelation;
      const dealerRelation = normalizedCase.dealers;
      const dealer = Array.isArray(dealerRelation)
        ? dealerRelation[0] || null
        : dealerRelation;

      const supplierId =
        dealer?.default_supplier_id || "";
      let nextLines = buildInitialLines(
        (rawCaseProducts || []) as CaseProductSource[],
        (rawCasePackages || []) as CasePackageSource[]
      );

      nextLines = await applyPurchasePriceFallback(nextLines, supplierId);

      if (cancelled) {
        return;
      }

      setSuppliers((supplierData || []) as Supplier[]);
      setCaseData(normalizedCase);
      setLines(nextLines);
      setForm((current) => ({
        ...current,
        supplier_id: current.supplier_id || supplierId,
        order_no:
          current.order_no || generateOrderNumber(normalizedCase.case_no),
        expected_delivery_date:
          current.expected_delivery_date ||
          normalizedCase.desired_delivery_date ||
          "",
      }));
      setInitialLoading(false);
    }

    void fetchInitialData();

    return () => {
      cancelled = true;
    };
  }, [caseId, caseIdError]);

  function handleChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));

    // スナップショットがない明細のみ、仕入先変更時に価格マスタで再補完
    if (name === "supplier_id") {
      setLines((current) => {
        void applyPurchasePriceFallback(current, value).then(setLines);
        return current;
      });
    }
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

    if (!caseData) {
      setSubmitError("案件情報を取得できていません。画面を更新してください。");
      return;
    }

    if (!form.supplier_id) {
      setSubmitError("仕入先を選択してください。");
      return;
    }

    if (!form.order_no.trim()) {
      setSubmitError("発注番号を入力してください。");
      return;
    }

    if (!form.order_date) {
      setSubmitError("発注日を入力してください。");
      return;
    }

    if (
      form.expected_delivery_date &&
      form.expected_delivery_date < form.order_date
    ) {
      setSubmitError("納品予定日は発注日以降に設定してください。");
      return;
    }

    if (lines.length === 0) {
      setSubmitError("発注明細がありません。案件に商品を追加してください。");
      return;
    }

    for (const line of lines) {
      if (!line.product_id) {
        setSubmitError("商品が紐づいていない明細があります。");
        return;
      }
      if (toNumber(line.quantity) <= 0) {
        setSubmitError("数量は1以上で入力してください。");
        return;
      }
      if (toNumber(line.unit_price) < 0) {
        setSubmitError("単価は0以上で入力してください。");
        return;
      }
    }

    if (orderAmount <= 0) {
      setSubmitError("発注金額は1円以上になるよう明細を入力してください。");
      return;
    }

    if (submitting) {
      return;
    }

    setSubmitting(true);

    const { data: duplicateOrder, error: duplicateError } = await supabase
      .from("orders")
      .select("id")
      .eq("order_no", form.order_no.trim())
      .maybeSingle();

    if (duplicateError) {
      setSubmitError(`発注番号の確認に失敗しました：${duplicateError.message}`);
      setSubmitting(false);
      return;
    }

    if (duplicateOrder) {
      setSubmitError(
        "同じ発注番号がすでに登録されています。別の発注番号を入力してください。"
      );
      setSubmitting(false);
      return;
    }

    const today = getTodayString();
    const deliveredDate = resolveDeliveredDate(form.status, null, today);

    const { data: insertedOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        case_id: caseData.id,
        supplier_id: form.supplier_id,
        order_no: form.order_no.trim(),
        order_date: form.order_date,
        expected_delivery_date: form.expected_delivery_date || null,
        delivered_date: deliveredDate,
        order_amount: orderAmount,
        status: form.status,
        memo: form.memo.trim() || null,
      })
      .select("id")
      .single();

    if (orderError || !insertedOrder) {
      setSubmitError(
        `発注登録に失敗しました：${
          orderError?.message || "登録結果を取得できませんでした"
        }`
      );
      setSubmitting(false);
      return;
    }

    const orderId = insertedOrder.id as string;
    const itemPayload = lines.map((line, index) => {
      const quantity = toNumber(line.quantity);
      const unitPrice = toNumber(line.unit_price);
      return {
        order_id: orderId,
        product_id: line.product_id,
        case_product_id: line.case_product_id,
        quantity,
        unit_price: unitPrice,
        amount: calcLineAmount(quantity, unitPrice),
        memo: line.memo.trim() || null,
        sort_order: index,
      };
    });

    const itemsResult = await insertOrderItems(itemPayload);
    if (itemsResult.error) {
      await supabase.from("orders").delete().eq("id", orderId);
      setSubmitError(`発注明細の保存に失敗しました：${itemsResult.error}`);
      setSubmitting(false);
      return;
    }

    const nextCaseStatus = getCaseStatusFromOrderStatus(form.status);
    if (nextCaseStatus) {
      const { error: caseStatusError } = await supabase
        .from("cases")
        .update({ status: nextCaseStatus })
        .eq("id", caseData.id);

      if (caseStatusError) {
        window.alert(
          `発注は登録されましたが、案件ステータスの更新に失敗しました。\n${caseStatusError.message}`
        );
      }
    }

    setSubmitting(false);
    router.push(`/orders/${orderId}`);
    router.refresh();
  }

  if (initialLoading) {
    return (
      <>
        <PageHeader title="発注登録" description="案件情報を読み込んでいます。" />
        <main className="p-4 md:p-8">
          <div className="rounded-xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-gray-500">読み込み中...</p>
          </div>
        </main>
      </>
    );
  }

  if (loadError || !caseData) {
    return (
      <>
        <PageHeader
          title="発注登録"
          description="案件情報を取得できませんでした。"
        />
        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">データ取得エラー</p>
            <p className="mt-2 break-words text-sm text-red-600">
              {loadError || "案件情報が見つかりませんでした。"}
            </p>
            <Link
              href="/cases"
              className="mt-5 inline-flex rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white"
            >
              案件一覧へ戻る
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="発注登録"
        description={`案件番号：${caseData.case_no || "-"} / 顧客名：${
          caseData.customer_name || "-"
        }`}
      />

      <main className="space-y-6 p-4 md:p-8">
        <div>
          <Link
            href={`/cases/${caseData.id}`}
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 案件詳細へ戻る
          </Link>
        </div>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">発注対象案件</h2>
          <div className="grid gap-5 md:grid-cols-4">
            <Info label="案件番号" value={caseData.case_no} />
            <Info label="顧客名" value={caseData.customer_name} />
            <Info label="発注区分" value={caseData.order_type} />
            <Info
              label="案件希望納期"
              value={formatDate(caseData.desired_delivery_date)}
            />
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl bg-white p-5 shadow-sm md:p-8"
        >
          <h2 className="text-lg font-bold text-gray-900">発注情報</h2>

          {submitError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="仕入先" required>
              <select
                name="supplier_id"
                value={form.supplier_id}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              >
                <option value="">仕入先を選択</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name || "名称未設定"}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="発注番号"
              required
              description="自動採番されています。必要に応じて変更できます。"
            >
              <input
                type="text"
                name="order_no"
                value={form.order_no}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="発注日" required>
              <input
                type="date"
                name="order_date"
                value={form.order_date}
                onChange={handleChange}
                required
                disabled={submitting}
                className={inputClassName}
              />
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

            <Field label="発注金額（明細合計）">
              <p className="rounded-lg border border-gray-200 bg-[#f7f7f5] px-4 py-3 text-right text-sm font-semibold text-gray-900">
                {formatYen(orderAmount)}
              </p>
            </Field>
          </div>

          <div>
            <h3 className="mb-3 text-base font-bold text-gray-900">発注明細</h3>
            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center text-sm text-gray-500">
                案件に商品／パッケージ構成がありません。商品タブで追加してください。
              </div>
            ) : (
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
                    {lines.map((line) => {
                      const amount = calcLineAmount(
                        toNumber(line.quantity),
                        toNumber(line.unit_price)
                      );
                      return (
                        <tr key={line.local_id} className="border-b last:border-b-0">
                          <td className="px-3 py-3 text-gray-900">
                            {line.product_name || "-"}
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {line.model_no || "-"}
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
                          <td className="px-3 py-3 text-right text-gray-900">
                            {formatYen(amount)}
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
                      );
                    })}
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
              href={`/cases/${caseData.id}`}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting || lines.length === 0}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting ? "登録しています..." : "発注を登録する"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

type CaseProductSource = {
  id: string;
  product_id: string | null;
  quantity: number | string | null;
  purchase_price: number | string | null;
  memo: string | null;
  products:
    | { name: string | null; model_no: string | null }
    | { name: string | null; model_no: string | null }[]
    | null;
};

type CasePackageItemSource = {
  id: string;
  product_id: string | null;
  quantity: number | string | null;
  unit_purchase_price: number | string | null;
  total_purchase_price: number | string | null;
  memo: string | null;
  is_selected: boolean | null;
  is_hidden: boolean | null;
  sort_order: number | null;
  product_name_snapshot: string | null;
  model_no_snapshot: string | null;
  display_name_snapshot: string | null;
  products:
    | { name: string | null; model_no: string | null }
    | { name: string | null; model_no: string | null }[]
    | null;
};

type CasePackageSource = {
  id: string;
  case_package_items:
    | CasePackageItemSource[]
    | CasePackageItemSource
    | null;
};

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] || null : value;
}

function buildInitialLines(
  caseProducts: CaseProductSource[],
  casePackages: CasePackageSource[]
): LineDraft[] {
  const lines: LineDraft[] = [];

  for (const row of caseProducts) {
    if (!row.product_id) {
      continue;
    }
    const product = getSingleRelation(row.products);
    const quantity = Math.max(toNumber(row.quantity), 1);
    const purchaseTotal = toNumber(row.purchase_price);
    const unitPrice =
      purchaseTotal > 0 && quantity > 0
        ? Math.round(purchaseTotal / quantity)
        : 0;

    lines.push({
      local_id: `cp-${row.id}`,
      product_id: row.product_id,
      case_product_id: row.id,
      product_name: product?.name || "名称未設定",
      model_no: product?.model_no || "",
      quantity: String(quantity),
      unit_price: String(unitPrice),
      memo: row.memo || "",
      sort_order: lines.length,
      has_case_snapshot: unitPrice > 0,
    });
  }

  for (const pkg of casePackages) {
    const items = Array.isArray(pkg.case_package_items)
      ? pkg.case_package_items
      : pkg.case_package_items
        ? [pkg.case_package_items]
        : [];

    const visible = items
      .filter(
        (item) =>
          item.is_selected !== false &&
          item.is_hidden !== true &&
          Boolean(item.product_id)
      )
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    for (const item of visible) {
      const product = getSingleRelation(item.products);
      const quantity = Math.max(toNumber(item.quantity), 1);
      const unitFromField = toNumber(item.unit_purchase_price);
      const total = toNumber(item.total_purchase_price);
      const unitPrice =
        unitFromField > 0
          ? unitFromField
          : total > 0 && quantity > 0
            ? Math.round(total / quantity)
            : 0;

      lines.push({
        local_id: `cpi-${item.id}`,
        product_id: item.product_id as string,
        case_product_id: null,
        product_name:
          item.display_name_snapshot ||
          item.product_name_snapshot ||
          product?.name ||
          "名称未設定",
        model_no: item.model_no_snapshot || product?.model_no || "",
        quantity: String(quantity),
        unit_price: String(unitPrice),
        memo: item.memo || "",
        sort_order: lines.length,
        has_case_snapshot: unitPrice > 0,
      });
    }
  }

  return lines;
}

/**
 * 案件スナップショットが null/0 の明細のみ purchase_prices で補完。
 * 優先: 1.案件スナップショット 2.価格マスタ 3.0円
 */
async function applyPurchasePriceFallback(
  lines: LineDraft[],
  supplierId: string
): Promise<LineDraft[]> {
  const targets = lines.filter(
    (line) => !line.has_case_snapshot && Boolean(line.product_id)
  );

  if (targets.length === 0) {
    return lines;
  }

  if (!supplierId) {
    console.warn(
      "[orders/new] 仕入先未選択のため、スナップショットなし明細は 0円のままです。"
    );
    return lines.map((line) =>
      line.has_case_snapshot
        ? line
        : { ...line, unit_price: "0" }
    );
  }

  const priceResult = await fetchActivePurchaseUnitPrices(supabase, {
    productIds: targets.map((line) => line.product_id),
    supplierId,
  });

  if (priceResult.error) {
    console.warn(
      "[orders/new] 価格マスタフォールバック取得エラー:",
      priceResult.error
    );
  }

  if (priceResult.missingProductIds.length > 0) {
    console.warn(
      "[orders/new] 価格マスタ未取得（0円）product_ids:",
      priceResult.missingProductIds
    );
  }

  return lines.map((line) => {
    if (line.has_case_snapshot) {
      return line;
    }
    const unit = priceResult.unitPriceByProductId.get(line.product_id) || 0;
    return {
      ...line,
      unit_price: String(unit),
    };
  });
}

function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="border-b bg-white px-4 py-5 md:px-8">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {description ? (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      ) : null}
    </header>
  );
}

function Field({
  label,
  required = false,
  description,
  children,
}: {
  label: string;
  required?: boolean;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-700">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      {description ? (
        <span className="mt-1 block text-xs text-gray-500">{description}</span>
      ) : null}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-gray-900">
        {value || "-"}
      </p>
    </div>
  );
}
