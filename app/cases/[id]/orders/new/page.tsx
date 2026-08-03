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

import { fetchActivePurchaseUnitPrices } from "@/lib/purchasePrices";
import { supabase } from "@/lib/supabase";
import { loadCaseWorkflow } from "@/lib/workflow/loadCaseWorkflow";
import type { WorkflowResult } from "@/lib/workflow";

import {
  getCaseStatusFromOrderStatus,
  PURCHASE_ORDER_STATUSES,
  resolveDeliveredDate,
} from "@/app/orders/orderConstants";
import {
  calcLineAmount,
  formatDate,
  formatYen,
  getTodayString,
  isUuid,
} from "@/app/orders/orderUtils";
import {
  isUnitPriceRealZero,
  isUnitPriceUnset,
  parseOrderQuantity,
  parseUnitPriceInput,
} from "../../buildOrderLines";
import {
  applySupplierMasterUnitPrices,
  buildOrderTargets,
  clearNonSnapshotPricesForSupplierChange,
  flattenOrderTargets,
  generateUniqueOrderNumbers,
  groupLinesBySupplier,
  sumOrderAmount,
  validateOrderTargetsForSave,
  type OrderTarget,
  type PackageOrderTarget,
  type ProductOrderTarget,
} from "../orderTargets";
import {
  createIdempotencyKey,
  submitPurchaseOrders,
} from "./submitPurchaseOrders";

type Supplier = {
  id: string;
  name: string | null;
};

type CaseRelation = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  desired_delivery_date: string | null;
};

type OrderForm = {
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
  const [targets, setTargets] = useState<OrderTarget[]>([]);
  const [initialLoading, setInitialLoading] = useState(!caseIdError);
  const [submitting, setSubmitting] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [loadError, setLoadError] = useState(caseIdError);
  const [submitError, setSubmitError] = useState("");
  const [missingPriceNames, setMissingPriceNames] = useState<string[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowResult | null>(null);
  const [form, setForm] = useState<OrderForm>({
    order_date: getTodayString(),
    expected_delivery_date: "",
    status: "発注済",
    memo: "",
  });

  const targetsRef = useRef<OrderTarget[]>([]);
  const formRef = useRef<OrderForm>(form);
  const priceRequestIdRef = useRef(0);

  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const flatLines = useMemo(() => flattenOrderTargets(targets), [targets]);
  const orderAmount = useMemo(() => sumOrderAmount(flatLines), [flatLines]);
  const supplierBuckets = useMemo(
    () => groupLinesBySupplier(flatLines),
    [flatLines]
  );

  const unsetPriceLines = useMemo(
    () => flatLines.filter((line) => isUnitPriceUnset(line.unit_price)),
    [flatLines]
  );

  const zeroPriceLines = useMemo(
    () => flatLines.filter((line) => isUnitPriceRealZero(line.unit_price)),
    [flatLines]
  );

  const missingSupplierTargets = useMemo(
    () => targets.filter((t) => !t.supplier_id.trim()),
    [targets]
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
            desired_delivery_date
          `
          )
          .eq("id", caseId)
          .single(),
        supabase
          .from("case_products")
          .select(
            `
            id,
            line_type,
            product_id,
            quantity,
            purchase_price,
            memo,
            products (
              name,
              model_no,
              default_supplier_id
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
            package_id,
            quantity,
            package_name_snapshot,
            packages (
              name,
              default_supplier_id
            ),
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
      let nextTargets = buildOrderTargets(
        (rawCaseProducts || []) as Parameters<typeof buildOrderTargets>[0],
        (rawCasePackages || []) as Parameters<typeof buildOrderTargets>[1]
      );

      const priced = await refreshPricesForTargets(
        nextTargets,
        formRef.current.order_date
      );
      nextTargets = priced.targets;

      if (cancelled) {
        return;
      }

      const workflowLoad = await loadCaseWorkflow(caseId);
      if (cancelled) {
        return;
      }

      setSuppliers((supplierData || []) as Supplier[]);
      setCaseData(normalizedCase);
      setTargets(nextTargets);
      setMissingPriceNames(priced.missingProductNames);
      setWorkflow(workflowLoad.result);
      setForm((current) => ({
        ...current,
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

  async function refreshPricesForTargets(
    currentTargets: OrderTarget[],
    orderDate: string
  ): Promise<{ targets: OrderTarget[]; missingProductNames: string[] }> {
    const bySupplier = new Map<string, string[]>();

    for (const target of currentTargets) {
      const supplierId = target.supplier_id.trim();
      if (!supplierId) continue;
      const list = bySupplier.get(supplierId) || [];
      if (target.kind === "PRODUCT") {
        if (!target.has_case_snapshot && target.product_id) {
          list.push(target.product_id);
        }
      } else {
        for (const item of target.items) {
          if (!item.has_case_snapshot && item.product_id) {
            list.push(item.product_id);
          }
        }
      }
      bySupplier.set(supplierId, list);
    }

    const unitPriceBySupplierProduct = new Map<string, Map<string, number>>();

    await Promise.all(
      Array.from(bySupplier.entries()).map(async ([supplierId, productIds]) => {
        const unique = Array.from(new Set(productIds));
        if (unique.length === 0) {
          unitPriceBySupplierProduct.set(supplierId, new Map());
          return;
        }
        const priceResult = await fetchActivePurchaseUnitPrices(supabase, {
          productIds: unique,
          supplierId,
          asOfDate: orderDate || getTodayString(),
        });
        if (priceResult.error) {
          console.warn(
            "[orders/new] 価格マスタ取得エラー:",
            priceResult.error
          );
        }
        unitPriceBySupplierProduct.set(
          supplierId,
          priceResult.unitPriceByProductId
        );
      })
    );

    return applySupplierMasterUnitPrices(
      currentTargets,
      unitPriceBySupplierProduct
    );
  }

  async function runPriceRefresh(
    nextTargets: OrderTarget[],
    orderDate: string
  ) {
    const requestId = ++priceRequestIdRef.current;
    setPriceLoading(true);
    setSubmitError("");
    setMissingPriceNames([]);

    try {
      const priced = await refreshPricesForTargets(nextTargets, orderDate);
      if (requestId !== priceRequestIdRef.current) {
        return;
      }
      setTargets(priced.targets);
      setMissingPriceNames(priced.missingProductNames);
    } finally {
      if (requestId === priceRequestIdRef.current) {
        setPriceLoading(false);
      }
    }
  }

  async function handleFormChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));

    if (name === "order_date") {
      const cleared = clearNonSnapshotPricesForSupplierChange(
        targetsRef.current,
        { clearAllNonSnapshot: true }
      );
      setTargets(cleared);
      await runPriceRefresh(cleared, value);
    }
  }

  async function handleProductSupplierChange(
    localId: string,
    supplierId: string
  ) {
    const next = targetsRef.current.map((target) =>
      target.kind === "PRODUCT" && target.local_id === localId
        ? { ...target, supplier_id: supplierId }
        : target
    );
    const cleared = clearNonSnapshotPricesForSupplierChange(next, {
      productLocalId: localId,
    });
    setTargets(cleared);
    await runPriceRefresh(cleared, formRef.current.order_date);
  }

  async function handlePackageSupplierChange(
    localId: string,
    supplierId: string
  ) {
    const next = targetsRef.current.map((target) =>
      target.kind === "PACKAGE" && target.local_id === localId
        ? { ...target, supplier_id: supplierId }
        : target
    );
    const cleared = clearNonSnapshotPricesForSupplierChange(next, {
      packageLocalId: localId,
    });
    setTargets(cleared);
    await runPriceRefresh(cleared, formRef.current.order_date);
  }

  function handleProductFieldChange(
    localId: string,
    field: "quantity" | "unit_price" | "memo",
    value: string
  ) {
    setTargets((current) =>
      current.map((target) =>
        target.kind === "PRODUCT" && target.local_id === localId
          ? { ...target, [field]: value }
          : target
      )
    );
  }

  function handlePackageItemFieldChange(
    packageLocalId: string,
    itemLocalId: string,
    field: "quantity" | "unit_price" | "memo",
    value: string
  ) {
    setTargets((current) =>
      current.map((target) => {
        if (target.kind !== "PACKAGE" || target.local_id !== packageLocalId) {
          return target;
        }
        return {
          ...target,
          items: target.items.map((item) =>
            item.local_id === itemLocalId ? { ...item, [field]: value } : item
          ),
        };
      })
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!caseData) {
      setSubmitError("案件情報を取得できていません。画面を更新してください。");
      return;
    }

    const latestWorkflow = await loadCaseWorkflow(caseData.id);
    setWorkflow(latestWorkflow.result);
    if (!latestWorkflow.result.canOrder) {
      setSubmitError(
        latestWorkflow.result.warnings[0] ||
          "現在の決済区分ルールでは発注できません。"
      );
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

    const validated = validateOrderTargetsForSave(targets);
    if (!validated.ok) {
      setSubmitError(validated.error_message);
      return;
    }

    if (unsetPriceLines.length > 0) {
      setSubmitError(
        "仕入単価が未設定の明細があります。価格マスタを確認するか、手入力してください。"
      );
      return;
    }

    if (zeroPriceLines.length > 0) {
      const names = zeroPriceLines
        .map((line) => line.product_name || "名称未設定")
        .join("、");
      const ok = window.confirm(
        `仕入単価が0円の明細があります。未設定ではなく「0円」として保存します。よろしいですか？\n\n対象商品：${names}`
      );
      if (!ok) {
        setSubmitError(
          "仕入単価0円の明細があります。単価を入力するか、確認のうえ再度保存してください。"
        );
        return;
      }
    }

    const buckets = groupLinesBySupplier(flattenOrderTargets(targets));
    if (buckets.length === 0) {
      setSubmitError("仕入先を選択してください。");
      return;
    }

    if (buckets.length > 1) {
      const ok = window.confirm(
        `仕入先が${buckets.length}社に分かれています。発注を${buckets.length}件作成します。よろしいですか？`
      );
      if (!ok) {
        return;
      }
    }

    if (submitting) {
      return;
    }

    setSubmitting(true);

    const today = getTodayString();
    const deliveredDate = resolveDeliveredDate(form.status, null, today);
    const nextCaseStatus = getCaseStatusFromOrderStatus(form.status);
    const orderNos = generateUniqueOrderNumbers(
      caseData.case_no,
      buckets.length
    );

    const result = await submitPurchaseOrders({
      caseId: caseData.id,
      idempotencyKey: createIdempotencyKey(),
      body: {
        order_date: form.order_date,
        expected_delivery_date: form.expected_delivery_date || null,
        delivered_date: deliveredDate,
        status: form.status,
        memo: form.memo.trim() || null,
        case_status: nextCaseStatus,
        orders: buckets.map((bucket, index) => ({
          supplier_id: bucket.supplier_id,
          order_no: orderNos[index],
          items: bucket.lines.map((line, sortOrder) => {
            const quantity = parseOrderQuantity(line.quantity) as number;
            const unitPrice = Math.round(
              parseUnitPriceInput(line.unit_price) as number
            );
            return {
              product_id: line.product_id,
              case_product_id: line.case_product_id,
              quantity,
              unit_price: unitPrice,
              memo: line.memo.trim() || null,
              sort_order: sortOrder,
            };
          }),
        })),
      },
    });

    if (!result.ok) {
      setSubmitError(result.error_message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    const firstOrderId = result.orders[0]?.id;
    if (firstOrderId) {
      router.push(`/orders/${firstOrderId}`);
    } else {
      router.push(`/cases/${caseData.id}`);
    }
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
          <div className="grid gap-5 md:grid-cols-3">
            <Info label="案件番号" value={caseData.case_no} />
            <Info label="顧客名" value={caseData.customer_name} />
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

          {workflow && !workflow.canOrder ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">発注できません</p>
              <p className="mt-1">
                担当: {workflow.assignee} / 次のアクション: {workflow.nextAction}
              </p>
              {workflow.warnings.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {workflow.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          {missingSupplierTargets.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              仕入先未選択の商品／パッケージがあります。各行で仕入先を選択してください。
            </div>
          ) : null}

          {missingSupplierTargets.length === 0 &&
          (missingPriceNames.length > 0 || unsetPriceLines.length > 0) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                仕入単価が未設定の明細があります。手入力してください（未設定のままでは保存できません）。
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {(missingPriceNames.length > 0
                  ? missingPriceNames
                  : unsetPriceLines.map((l) => l.product_name || "名称未設定")
                ).map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {priceLoading ? (
            <div className="rounded-lg border border-gray-200 bg-[#f7f7f5] p-3 text-sm text-gray-600">
              価格マスタを取得しています…
            </div>
          ) : null}

          {supplierBuckets.length > 1 ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              仕入先が{supplierBuckets.length}
              社に分かれています。保存すると発注が
              {supplierBuckets.length}件作成されます。
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="発注日" required>
              <input
                type="date"
                name="order_date"
                value={form.order_date}
                onChange={handleFormChange}
                required
                disabled={submitting || priceLoading}
                className={inputClassName}
              />
            </Field>

            <Field label="納品予定日">
              <input
                type="date"
                name="expected_delivery_date"
                value={form.expected_delivery_date}
                onChange={handleFormChange}
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="発注ステータス" required>
              <select
                name="status"
                value={form.status}
                onChange={handleFormChange}
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
            <p className="mb-3 text-xs text-gray-500">
              PRODUCTは商品行ごと、PACKAGEはパッケージ単位で仕入先を選択します（構成品に仕入先選択はありません）。
              初期値は各マスタの標準仕入先です。単価優先: 案件スナップショット →
              選択仕入先の価格マスタ → 手入力。
            </p>
            {targets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center text-sm text-gray-500">
                案件に商品／パッケージ構成がありません。商品タブで追加してください。
              </div>
            ) : (
              <div className="space-y-4">
                {targets.map((target) =>
                  target.kind === "PRODUCT" ? (
                    <ProductTargetCard
                      key={target.local_id}
                      target={target}
                      suppliers={suppliers}
                      disabled={submitting || priceLoading}
                      onSupplierChange={handleProductSupplierChange}
                      onFieldChange={handleProductFieldChange}
                    />
                  ) : (
                    <PackageTargetCard
                      key={target.local_id}
                      target={target}
                      suppliers={suppliers}
                      disabled={submitting || priceLoading}
                      onSupplierChange={handlePackageSupplierChange}
                      onItemFieldChange={handlePackageItemFieldChange}
                    />
                  )
                )}
              </div>
            )}
          </div>

          <Field label="備考">
            <textarea
              name="memo"
              value={form.memo}
              onChange={handleFormChange}
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
              disabled={
                submitting ||
                priceLoading ||
                targets.length === 0 ||
                missingSupplierTargets.length > 0
              }
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting
                ? "登録しています..."
                : supplierBuckets.length > 1
                  ? `発注を${supplierBuckets.length}件登録する`
                  : "発注を登録する"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

function ProductTargetCard({
  target,
  suppliers,
  disabled,
  onSupplierChange,
  onFieldChange,
}: {
  target: ProductOrderTarget;
  suppliers: Supplier[];
  disabled: boolean;
  onSupplierChange: (localId: string, supplierId: string) => void;
  onFieldChange: (
    localId: string,
    field: "quantity" | "unit_price" | "memo",
    value: string
  ) => void;
}) {
  const qty = parseOrderQuantity(target.quantity) ?? 0;
  const unit = parseUnitPriceInput(target.unit_price);
  const amount =
    unit == null || unit < 0 ? 0 : calcLineAmount(qty, unit);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {target.product_name || "-"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {target.model_no || "-"}
            {target.has_case_snapshot ? " · 既存単価" : ""}
            {" · 単体商品"}
          </p>
        </div>
        <label className="block min-w-[220px] flex-1">
          <span className="text-xs font-bold text-gray-600">
            仕入先<span className="ml-1 text-red-600">*</span>
          </span>
          <select
            value={target.supplier_id}
            onChange={(e) =>
              void onSupplierChange(target.local_id, e.target.value)
            }
            disabled={disabled}
            className={`${inputClassName} mt-1`}
          >
            <option value="">仕入先を選択</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name || "名称未設定"}
                {target.default_supplier_id === supplier.id
                  ? "（標準）"
                  : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="block">
          <span className="text-xs font-bold text-gray-600">数量</span>
          <input
            type="text"
            inputMode="numeric"
            value={target.quantity}
            onChange={(e) =>
              onFieldChange(target.local_id, "quantity", e.target.value)
            }
            disabled={disabled}
            className={`${inputClassName} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-gray-600">仕入単価</span>
          <input
            type="text"
            inputMode="numeric"
            value={target.unit_price}
            placeholder="未設定"
            onChange={(e) =>
              onFieldChange(target.local_id, "unit_price", e.target.value)
            }
            disabled={disabled}
            className={`${inputClassName} mt-1 text-right`}
          />
        </label>
        <div>
          <p className="text-xs font-bold text-gray-600">金額</p>
          <p className="mt-3 text-sm font-semibold text-gray-900">
            {isUnitPriceUnset(target.unit_price) ? "—" : formatYen(amount)}
          </p>
        </div>
        <label className="block">
          <span className="text-xs font-bold text-gray-600">備考</span>
          <input
            type="text"
            value={target.memo}
            onChange={(e) =>
              onFieldChange(target.local_id, "memo", e.target.value)
            }
            disabled={disabled}
            className={`${inputClassName} mt-1`}
          />
        </label>
      </div>
    </div>
  );
}

function PackageTargetCard({
  target,
  suppliers,
  disabled,
  onSupplierChange,
  onItemFieldChange,
}: {
  target: PackageOrderTarget;
  suppliers: Supplier[];
  disabled: boolean;
  onSupplierChange: (localId: string, supplierId: string) => void;
  onItemFieldChange: (
    packageLocalId: string,
    itemLocalId: string,
    field: "quantity" | "unit_price" | "memo",
    value: string
  ) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {target.package_name || "パッケージ"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            パッケージ単位で仕入先を選択（構成品は引き継ぎ）
          </p>
        </div>
        <label className="block min-w-[220px] flex-1">
          <span className="text-xs font-bold text-gray-600">
            仕入先<span className="ml-1 text-red-600">*</span>
          </span>
          <select
            value={target.supplier_id}
            onChange={(e) =>
              void onSupplierChange(target.local_id, e.target.value)
            }
            disabled={disabled}
            className={`${inputClassName} mt-1`}
          >
            <option value="">仕入先を選択</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name || "名称未設定"}
                {target.default_supplier_id === supplier.id
                  ? "（標準）"
                  : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 space-y-3">
        {target.items.map((item) => {
          const qty = parseOrderQuantity(item.quantity) ?? 0;
          const unit = parseUnitPriceInput(item.unit_price);
          const amount =
            unit == null || unit < 0 ? 0 : calcLineAmount(qty, unit);
          return (
            <div
              key={item.local_id}
              className="rounded-md bg-[#f7f7f5] p-3"
            >
              <p className="text-sm font-medium text-gray-900">
                {item.product_name || "-"}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {item.model_no || "-"} · パッケージ構成
                {item.has_case_snapshot ? " · 既存単価" : ""}
                {" · 仕入先はパッケージに準拠"}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <label className="block">
                  <span className="text-xs font-bold text-gray-600">数量</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.quantity}
                    onChange={(e) =>
                      onItemFieldChange(
                        target.local_id,
                        item.local_id,
                        "quantity",
                        e.target.value
                      )
                    }
                    disabled={disabled}
                    className={`${inputClassName} mt-1`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-gray-600">
                    仕入単価
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.unit_price}
                    placeholder="未設定"
                    onChange={(e) =>
                      onItemFieldChange(
                        target.local_id,
                        item.local_id,
                        "unit_price",
                        e.target.value
                      )
                    }
                    disabled={disabled}
                    className={`${inputClassName} mt-1 text-right`}
                  />
                </label>
                <div>
                  <p className="text-xs font-bold text-gray-600">金額</p>
                  <p className="mt-3 text-sm font-semibold text-gray-900">
                    {isUnitPriceUnset(item.unit_price)
                      ? "—"
                      : formatYen(amount)}
                  </p>
                </div>
                <label className="block">
                  <span className="text-xs font-bold text-gray-600">備考</span>
                  <input
                    type="text"
                    value={item.memo}
                    onChange={(e) =>
                      onItemFieldChange(
                        target.local_id,
                        item.local_id,
                        "memo",
                        e.target.value
                      )
                    }
                    disabled={disabled}
                    className={`${inputClassName} mt-1`}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
