"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

import { parseCaseExtras } from "@/app/admin/orders/parseCaseExtras";
import { supabase } from "@/lib/supabase";
import { fetchActivePurchaseUnitPrices } from "@/lib/purchasePrices";
import { listOrderItemsByOrderId } from "@/lib/repositories/orderItems";
import {
  fetchActiveManufacturers,
  fetchActiveProducts,
  formatProductLabel,
  type ManufacturerOption,
  type ProductOption,
} from "@/app/dealer/orders/new/productMaster";
import {
  getCaseStatusFromOrderStatus,
  PURCHASE_ORDER_STATUSES,
  resolveDeliveredDate,
} from "@/app/orders/orderConstants";
import { formatYen, isUuid, toNumber } from "@/app/orders/orderUtils";
import {
  displayIdentityValue,
  resolveProductIdentity,
} from "@/app/orders/productIdentity";
import {
  canDeleteOrderEditLine,
  canEditOrderLineUnitPrice,
  containsPackageMemoMarker,
  displaySafeOrderItemMemo,
} from "@/lib/orders/orderPackageDisplay";
import {
  isCustomOrderLine,
  parseCustomOrderItemMemo,
  validateCustomOrderLineName,
} from "@/lib/orders/orderCustomLine";
import {
  buildReplacePurchaseOrderRpcPayload,
  lineAmountForOrderEdit,
  validateReplacePurchaseOrderItems,
} from "@/lib/orders/replacePurchaseOrderLogic";

type OrderLineAddMode = "master" | "custom";

type LineDraft = {
  id: string | null;
  local_id: string;
  add_mode: OrderLineAddMode;
  product_id: string;
  case_product_id: string | null;
  manufacturer_id: string;
  manufacturer_name: string;
  model_no: string;
  line_name: string;
  quantity: string;
  unit_price: string;
  memo: string;
  /** DB保存済み memo（パッケージ保護・自由入力エンコード判定用） */
  source_memo: string;
};

type OrderForm = {
  expected_delivery_date: string;
  delivered_date: string;
  status: string;
  memo: string;
  case_id: string | null;
  supplier_id: string | null;
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

function createEmptyLine(addMode: OrderLineAddMode = "master"): LineDraft {
  return {
    id: null,
    local_id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    add_mode: addMode,
    product_id: "",
    case_product_id: null,
    manufacturer_id: "",
    manufacturer_name: "",
    model_no: "",
    line_name: "",
    quantity: "1",
    unit_price: "",
    memo: "",
    source_memo: "",
  };
}

function isCustomLineDraft(line: LineDraft): boolean {
  return line.add_mode === "custom" || isCustomOrderLine(line.memo);
}

function resolveLineDraftMemoForAmount(line: LineDraft): string {
  if (containsPackageMemoMarker(line.memo)) {
    return line.memo;
  }
  if (isCustomLineDraft(line)) {
    return "";
  }
  return line.memo;
}

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id || "";

  const orderIdError =
    !orderId || !isUuid(orderId) ? "発注IDが不正です。" : "";

  const [form, setForm] = useState<OrderForm>({
    expected_delivery_date: "",
    delivered_date: "",
    status: "発注済",
    memo: "",
    case_id: null,
    supplier_id: null,
    order_no: "",
  });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const existingLinesRef = useRef<LineDraft[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
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
          lineAmountForOrderEdit({
            memo: resolveLineDraftMemoForAmount(line),
            quantity: line.quantity,
            unit_price: line.unit_price,
          }),
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
          supplier_id,
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
        { manufacturer_id: string; manufacturer_name: string; model_no: string }
      >();

      if (productIds.length > 0) {
        const { data: products, error: productsError } = await supabase
          .from("products")
          .select("id, model_no, manufacturer_id, manufacturers(name)")
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
            manufacturer_id: (product.manufacturer_id as string) || "",
            manufacturer_name: identity.manufacturerName,
            model_no: identity.modelNo,
          });
        }
      }

      if (cancelled) {
        return;
      }

      const [manufacturersResult, productsResult] = await Promise.all([
        fetchActiveManufacturers(),
        fetchActiveProducts(),
      ]);
      if (cancelled) {
        return;
      }
      if (manufacturersResult.errorMessage || productsResult.errorMessage) {
        setLoadError(
          manufacturersResult.errorMessage ||
            productsResult.errorMessage ||
            "商品マスタの取得に失敗しました。"
        );
        setLoading(false);
        return;
      }

      setForm({
        expected_delivery_date: (order.expected_delivery_date as string) || "",
        delivered_date: (order.delivered_date as string) || "",
        status: (order.status as string) || "発注済",
        memo: (order.memo as string) || "",
        case_id: caseId,
        supplier_id: (order.supplier_id as string | null) || null,
        order_no: (order.order_no as string) || "",
      });
      setHeaderOrderAmount(toNumber(order.order_amount));
      setDeliveryInfo(nextDelivery);
      setManufacturers(manufacturersResult.data);
      setProducts(productsResult.data);

      const nextLines = itemsResult.data.map((item) => {
          const custom = parseCustomOrderItemMemo(item.memo);
          const product = item.product_id
            ? productMap.get(item.product_id)
            : null;
          const unitPrice = canEditOrderLineUnitPrice(item.memo)
            ? toNumber(item.unit_price)
            : 0;
          if (custom) {
            return {
              id: item.id,
              local_id: item.id,
              add_mode: "custom" as const,
              product_id: "",
              case_product_id: item.case_product_id,
              manufacturer_id: "",
              manufacturer_name: custom.manufacturer,
              model_no: custom.lineName,
              line_name: custom.lineName,
              quantity: String(toNumber(item.quantity) || 1),
              unit_price: String(unitPrice),
              memo: custom.userMemo,
              source_memo: item.memo || "",
            };
          }
          return {
            id: item.id,
            local_id: item.id,
            add_mode: "master" as const,
            product_id: item.product_id || "",
            case_product_id: item.case_product_id,
            manufacturer_id: product?.manufacturer_id || "",
            manufacturer_name: product?.manufacturer_name || "",
            model_no: product?.model_no || "",
            line_name: "",
            quantity: String(toNumber(item.quantity) || 1),
            unit_price: String(unitPrice),
            memo: containsPackageMemoMarker(item.memo)
              ? item.memo || ""
              : displaySafeOrderItemMemo(item.memo),
            source_memo: item.memo || "",
          };
        });
      existingLinesRef.current = nextLines;
      setLines(nextLines);
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
    field:
      | "quantity"
      | "unit_price"
      | "memo"
      | "manufacturer_name"
      | "line_name",
    value: string
  ) {
    setLines((current) =>
      current.map((line) => {
        if (line.local_id !== localId) return line;
        if (field === "unit_price" && !canEditOrderLineUnitPrice(line.memo)) {
          return line;
        }
        return { ...line, [field]: value };
      })
    );
  }

  function handleAddLine(addMode: OrderLineAddMode = "master") {
    setLines((current) => [...current, createEmptyLine(addMode)]);
  }

  function handleAddModeChange(localId: string, addMode: OrderLineAddMode) {
    setLines((current) =>
      current.map((line) =>
        line.local_id === localId && line.id == null
          ? {
              ...createEmptyLine(addMode),
              local_id: line.local_id,
            }
          : line
      )
    );
  }

  function handleRemoveLine(localId: string) {
    setLines((current) => {
      const target = current.find((line) => line.local_id === localId);
      if (target && !canDeleteOrderEditLine(target.memo)) {
        return current;
      }
      return current.filter((line) => line.local_id !== localId);
    });
  }

  function productsForManufacturer(manufacturerId: string): ProductOption[] {
    if (!manufacturerId) return products;
    return products.filter((p) => p.manufacturer_id === manufacturerId);
  }

  function handleManufacturerChange(localId: string, manufacturerId: string) {
    const manufacturer = manufacturers.find((m) => m.id === manufacturerId);
    setLines((current) =>
      current.map((line) =>
        line.local_id === localId
          ? {
              ...line,
              manufacturer_id: manufacturerId,
              manufacturer_name: manufacturer?.name || "",
              product_id: "",
              model_no: "",
              unit_price: line.id ? line.unit_price : "",
            }
          : line
      )
    );
  }

  async function handleProductChange(localId: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    const manufacturer = product
      ? manufacturers.find((m) => m.id === (product.manufacturer_id || ""))
      : null;

    setLines((current) =>
      current.map((line) =>
        line.local_id === localId
          ? {
              ...line,
              product_id: productId,
              manufacturer_id: product?.manufacturer_id || line.manufacturer_id,
              manufacturer_name:
                manufacturer?.name || line.manufacturer_name,
              model_no: product?.model_no || "",
            }
          : line
      )
    );

    if (!productId || !form.supplier_id) {
      return;
    }

    const priceResult = await fetchActivePurchaseUnitPrices(supabase, {
      productIds: [productId],
      supplierId: form.supplier_id,
    });
    const unitPrice = priceResult.unitPriceByProductId.get(productId);
    if (unitPrice == null) {
      return;
    }
    setLines((current) =>
      current.map((line) =>
        line.local_id === localId &&
        line.product_id === productId &&
        canEditOrderLineUnitPrice(line.memo)
          ? { ...line, unit_price: String(unitPrice) }
          : line
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
      if (isCustomLineDraft(line)) {
        const customNameError = validateCustomOrderLineName(line.line_name);
        if (customNameError) {
          setSubmitError(customNameError);
          return;
        }
      } else if (!line.product_id && line.id == null) {
        setSubmitError("追加した明細はメーカー・製品/型番を選択してください。");
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

    const incoming = lines.map((line, index) => ({
      id: line.id,
      product_id: isCustomLineDraft(line) ? null : line.product_id || null,
      case_product_id: line.case_product_id,
      quantity: toNumber(line.quantity),
      unit_price: toNumber(line.unit_price),
      memo: containsPackageMemoMarker(line.memo) ? line.memo || null : null,
      custom_line_name: isCustomLineDraft(line) ? line.line_name : null,
      custom_manufacturer: isCustomLineDraft(line)
        ? line.manufacturer_name
        : null,
      custom_user_memo: isCustomLineDraft(line) ? line.memo : null,
      sort_order: index,
    }));
    const validated = validateReplacePurchaseOrderItems(
      existingLinesRef.current.map((line) => ({
        id: line.id || "",
        product_id: line.product_id || null,
        case_product_id: line.case_product_id,
        quantity: toNumber(line.quantity),
        unit_price: toNumber(line.unit_price),
        memo: line.source_memo || line.memo || null,
      })),
      incoming
    );
    if (!validated.ok) {
      setSubmitError(validated.error_message);
      return;
    }

    setSubmitting(true);
    const deliveredDate = resolveDeliveredDate(
      form.status,
      form.delivered_date
    );

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "replace_purchase_order",
      {
        payload: buildReplacePurchaseOrderRpcPayload({
          orderId,
          header: {
            expected_delivery_date: form.expected_delivery_date || null,
            delivered_date: deliveredDate,
            status: form.status,
            memo: form.memo.trim() || null,
          },
          items: validated.items,
        }),
      }
    );

    if (rpcError) {
      setSubmitError(`発注の更新に失敗しました：${rpcError.message}`);
      setSubmitting(false);
      return;
    }

    const rpcResult = (rpcData || {}) as {
      ok?: boolean;
      error_message?: string;
    };
    if (rpcResult.ok !== true) {
      setSubmitError(
        rpcResult.error_message || "発注の更新に失敗しました。"
      );
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
          明細の追加・削除、数量・仕入単価、納品予定日と実納品日を更新できます。発注金額は明細合計で再計算します。
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

            <Field label="実納品日">
              <input
                type="date"
                name="delivered_date"
                value={form.delivered_date}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              />
              <p className="mt-2 text-xs text-gray-500">
                納品予定日とは別です。登録日や更新日時では自動入力しません。
              </p>
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-bold text-gray-900">発注明細</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleAddLine("master")}
                  disabled={submitting}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  マスタから追加
                </button>
                <button
                  type="button"
                  onClick={() => handleAddLine("custom")}
                  disabled={submitting}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  自由入力で追加
                </button>
              </div>
            </div>
            {lines.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                発注明細がありません。「マスタから追加」または「自由入力で追加」から明細を登録してください。
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="border-b bg-[#f7f7f5] text-gray-500">
                    <tr>
                      <th className="px-3 py-3 font-medium">メーカー</th>
                      <th className="px-3 py-3 font-medium">製品/型番</th>
                      <th className="px-3 py-3 font-medium">数量</th>
                      <th className="px-3 py-3 font-medium">仕入単価</th>
                      <th className="px-3 py-3 font-medium">金額</th>
                      <th className="px-3 py-3 font-medium">備考</th>
                      <th className="px-3 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const isNew = line.id == null;
                      const isCustom = isCustomLineDraft(line);
                      const isPackage = containsPackageMemoMarker(line.memo);
                      const productOptions = productsForManufacturer(
                        line.manufacturer_id
                      );
                      return (
                      <tr
                        key={line.local_id}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-3 py-3">
                          {isNew ? (
                            <select
                              value={line.add_mode}
                              onChange={(e) =>
                                handleAddModeChange(
                                  line.local_id,
                                  e.target.value as OrderLineAddMode
                                )
                              }
                              disabled={submitting}
                              className={`${inputClassName} min-w-[140px]`}
                            >
                              <option value="master">マスタから選択</option>
                              <option value="custom">自由入力</option>
                            </select>
                          ) : null}
                          {isPackage ? (
                            displayIdentityValue(line.manufacturer_name)
                          ) : isCustom ? (
                            <input
                              type="text"
                              value={line.manufacturer_name}
                              onChange={(e) =>
                                handleLineChange(
                                  line.local_id,
                                  "manufacturer_name",
                                  e.target.value
                                )
                              }
                              disabled={submitting}
                              placeholder="任意（例: その他）"
                              className={`${inputClassName} min-w-[140px]${isNew ? " mt-1" : ""}`}
                            />
                          ) : isNew ? (
                            <select
                              value={line.manufacturer_id}
                              onChange={(e) =>
                                handleManufacturerChange(
                                  line.local_id,
                                  e.target.value
                                )
                              }
                              disabled={submitting}
                              className={`${inputClassName} min-w-[140px] mt-1`}
                            >
                              <option value="">選択</option>
                              {manufacturers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            displayIdentityValue(line.manufacturer_name)
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {isPackage ? (
                            displayIdentityValue(line.model_no)
                          ) : isCustom ? (
                            <input
                              type="text"
                              value={line.line_name}
                              onChange={(e) =>
                                handleLineChange(
                                  line.local_id,
                                  "line_name",
                                  e.target.value
                                )
                              }
                              disabled={submitting}
                              placeholder="明細名（必須）"
                              className={`${inputClassName} min-w-[180px]`}
                            />
                          ) : isNew ? (
                            <select
                              value={line.product_id}
                              onChange={(e) =>
                                void handleProductChange(
                                  line.local_id,
                                  e.target.value
                                )
                              }
                              disabled={submitting || !line.manufacturer_id}
                              className={`${inputClassName} min-w-[180px]`}
                            >
                              <option value="">選択</option>
                              {productOptions.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {formatProductLabel(p)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            displayIdentityValue(line.model_no)
                          )}
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
                            disabled={
                              submitting ||
                              !canEditOrderLineUnitPrice(line.memo)
                            }
                            className={`${inputClassName} w-32 text-right`}
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          {formatYen(
                            lineAmountForOrderEdit({
                              memo: resolveLineDraftMemoForAmount(line),
                              quantity: line.quantity,
                              unit_price: line.unit_price,
                            })
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {isPackage ? (
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
                        <td className="px-3 py-3">
                          {canDeleteOrderEditLine(line.memo) ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.local_id)}
                              disabled={submitting}
                              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-gray-100"
                            >
                              削除
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">削除不可</span>
                          )}
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
