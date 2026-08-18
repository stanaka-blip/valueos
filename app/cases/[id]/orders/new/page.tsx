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

import {
  fetchActivePackagePurchaseUnitPrices,
  fetchActivePurchaseUnitPrices,
} from "@/lib/purchasePrices";
import { supabase } from "@/lib/supabase";
import type { WorkflowResult } from "@/lib/workflow";

import {
  getCaseStatusFromOrderStatus,
  PURCHASE_ORDER_STATUSES,
  resolveDeliveredDate,
} from "@/app/orders/orderConstants";
import { fetchCaseWorkflowForOrderPage } from "../fetchCaseWorkflow";
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
  formatPurchaseOrderSheetLabel,
  generateUniqueOrderNumbers,
  groupLinesBySupplier,
  groupOrderTargetsBySupplier,
  packageLineAmount,
  scalePackageItemQuantities,
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

/** 決済区分未設定（WorkflowEngine の固定文言と一致） */
function isSettlementTypeUnset(workflow: WorkflowResult | null): boolean {
  if (!workflow) return false;
  return (
    workflow.ruleKey === null &&
    workflow.warnings.includes("決済区分が未設定です")
  );
}

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
  delivered_date: string;
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
  const [workflowLoadError, setWorkflowLoadError] = useState("");
  const [form, setForm] = useState<OrderForm>({
    order_date: getTodayString(),
    expected_delivery_date: "",
    delivered_date: "",
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
  const supplierTargetGroups = useMemo(
    () => groupOrderTargetsBySupplier(targets),
    [targets]
  );

  const unsetPriceLines = useMemo(
    () =>
      flatLines.filter(
        (line) =>
          line.source !== "PACKAGE_ITEM" && isUnitPriceUnset(line.unit_price)
      ),
    [flatLines]
  );

  const zeroPriceLines = useMemo(
    () =>
      flatLines.filter(
        (line) =>
          line.source !== "PACKAGE_ITEM" && isUnitPriceRealZero(line.unit_price)
      ),
    [flatLines]
  );

  const missingSupplierTargets = useMemo(
    () => targets.filter((t) => !t.supplier_id.trim()),
    [targets]
  );

  const settlementUnset = isSettlementTypeUnset(workflow);
  const orderBlockedBySettlementRule = Boolean(
    workflow && !workflow.canOrder && !settlementUnset
  );

  /** 画面表示と保存で同じ発注番号を使う（仕入先集合が変わったときだけ再採番） */
  const supplierBucketKey = supplierBuckets
    .map((bucket) => bucket.supplier_id)
    .join("|");
  const previewOrderNumbers = useMemo(
    () =>
      generateUniqueOrderNumbers(
        caseData?.case_no ?? null,
        supplierBuckets.length
      ),
    [caseData?.case_no, supplierBucketKey, supplierBuckets.length]
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
              default_supplier_id,
              manufacturers (
                name
              )
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
            case_product_id,
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
                model_no,
                manufacturers (
                  name
                )
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
      const purchaseByCaseProductId = new Map<string, number | string | null>();
      for (const row of rawCaseProducts || []) {
        const lt = String(
          (row as { line_type?: string | null }).line_type || ""
        )
          .trim()
          .toUpperCase();
        if (lt !== "PACKAGE") continue;
        const id = String((row as { id?: string }).id || "");
        if (!id) continue;
        purchaseByCaseProductId.set(
          id,
          (row as { purchase_price?: number | string | null }).purchase_price ??
            null
        );
      }
      const packagesForTargets = (rawCasePackages || []).map((pkg) => {
        const row = pkg as { case_product_id?: string | null };
        const cpId = row.case_product_id || null;
        return {
          ...pkg,
          case_product_purchase_price: cpId
            ? purchaseByCaseProductId.get(cpId) ?? null
            : null,
        };
      });
      let nextTargets = buildOrderTargets(
        (rawCaseProducts || []) as Parameters<typeof buildOrderTargets>[0],
        packagesForTargets as Parameters<typeof buildOrderTargets>[1]
      );

      const priced = await refreshPricesForTargets(
        nextTargets,
        formRef.current.order_date
      );
      nextTargets = priced.targets;

      if (cancelled) {
        return;
      }

      const workflowLoad = await fetchCaseWorkflowForOrderPage(caseId);
      if (cancelled) {
        return;
      }

      setSuppliers((supplierData || []) as Supplier[]);
      setCaseData(normalizedCase);
      setTargets(nextTargets);
      setMissingPriceNames(priced.missingProductNames);
      if (workflowLoad.ok) {
        setWorkflow(workflowLoad.result);
        setWorkflowLoadError("");
      } else {
        setWorkflow(null);
        setWorkflowLoadError(
          workflowLoad.error_message || "決済条件の取得に失敗しました"
        );
      }
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
    const productIdsBySupplier = new Map<string, string[]>();
    const packageIdsBySupplier = new Map<string, string[]>();

    for (const target of currentTargets) {
      const supplierId = target.supplier_id.trim();
      if (!supplierId) continue;
      if (target.kind === "PRODUCT") {
        if (!target.has_case_snapshot && target.product_id) {
          const list = productIdsBySupplier.get(supplierId) || [];
          list.push(target.product_id);
          productIdsBySupplier.set(supplierId, list);
        }
      } else if (!target.has_case_snapshot && target.package_id) {
        const list = packageIdsBySupplier.get(supplierId) || [];
        list.push(target.package_id);
        packageIdsBySupplier.set(supplierId, list);
      }
    }

    const unitPriceBySupplierProduct = new Map<string, Map<string, number>>();
    const unitPriceBySupplierPackage = new Map<string, Map<string, number>>();
    const supplierIds = new Set([
      ...productIdsBySupplier.keys(),
      ...packageIdsBySupplier.keys(),
    ]);

    await Promise.all(
      Array.from(supplierIds).map(async (supplierId) => {
        const productIds = Array.from(
          new Set(productIdsBySupplier.get(supplierId) || [])
        );
        const packageIds = Array.from(
          new Set(packageIdsBySupplier.get(supplierId) || [])
        );

        if (productIds.length > 0) {
          const priceResult = await fetchActivePurchaseUnitPrices(supabase, {
            productIds,
            supplierId,
            asOfDate: orderDate || getTodayString(),
          });
          if (priceResult.error) {
            console.warn(
              "[orders/new] 商品仕入価格マスタ取得エラー:",
              priceResult.error
            );
          }
          unitPriceBySupplierProduct.set(
            supplierId,
            priceResult.unitPriceByProductId
          );
        } else {
          unitPriceBySupplierProduct.set(supplierId, new Map());
        }

        if (packageIds.length > 0) {
          const pkgResult = await fetchActivePackagePurchaseUnitPrices(
            supabase,
            {
              packageIds,
              supplierId,
              asOfDate: orderDate || getTodayString(),
            }
          );
          if (pkgResult.error) {
            console.warn(
              "[orders/new] パッケージ仕入価格マスタ取得エラー:",
              pkgResult.error
            );
          }
          unitPriceBySupplierPackage.set(
            supplierId,
            pkgResult.unitPriceByPackageId
          );
        } else {
          unitPriceBySupplierPackage.set(supplierId, new Map());
        }
      })
    );

    return applySupplierMasterUnitPrices(
      currentTargets,
      unitPriceBySupplierProduct,
      unitPriceBySupplierPackage
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

  function handlePackageFieldChange(
    localId: string,
    field: "quantity" | "unit_price",
    value: string
  ) {
    setTargets((current) =>
      current.map((target) => {
        if (target.kind !== "PACKAGE" || target.local_id !== localId) {
          return target;
        }
        if (field === "quantity") {
          return scalePackageItemQuantities(target, value);
        }
        return { ...target, unit_price: value };
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

    const latestWorkflow = await fetchCaseWorkflowForOrderPage(caseData.id);
    if (!latestWorkflow.ok) {
      setWorkflow(null);
      setWorkflowLoadError(
        latestWorkflow.error_message || "決済条件の取得に失敗しました"
      );
      setSubmitError(
        latestWorkflow.error_message ||
          "決済条件を確認できませんでした。画面を更新して再度お試しください。"
      );
      return;
    }
    setWorkflow(latestWorkflow.result);
    setWorkflowLoadError("");
    // 決済区分未設定は警告のみ（保存可）。それ以外の canOrder=false はブロック。
    if (
      !latestWorkflow.result.canOrder &&
      !isSettlementTypeUnset(latestWorkflow.result)
    ) {
      // 画面上部の警告と二重表示しない（赤バナーは付けない）
      return;
    }

    if (!form.order_date) {
      setSubmitError("発注日を入力してください。");
      return;
    }

    if (!form.expected_delivery_date) {
      setSubmitError("納品予定日を入力してください。");
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

    const deliveredDate = resolveDeliveredDate(
      form.status,
      form.delivered_date
    );
    const nextCaseStatus = getCaseStatusFromOrderStatus(form.status);
    const orderNos =
      previewOrderNumbers.length === buckets.length
        ? previewOrderNumbers
        : generateUniqueOrderNumbers(caseData.case_no, buckets.length);

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
        <div className="flex flex-wrap gap-3">
          <Link
            href="/queues/orders"
            className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← 発注管理へ戻る
          </Link>
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

          {workflowLoadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              決済条件の取得に失敗しました：{workflowLoadError}
              （未設定とは限りません。画面を更新して再度お試しください。）
            </div>
          ) : null}

          {!workflowLoadError && settlementUnset ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              決済区分が未設定です。発注はできますが、請求処理までに設定してください。
            </div>
          ) : null}

          {!workflowLoadError && orderBlockedBySettlementRule ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">発注できません</p>
              <p className="mt-1">
                担当: {workflow?.assignee} / 次のアクション:{" "}
                {workflow?.nextAction}
              </p>
              {workflow && workflow.warnings.length > 0 ? (
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

            <Field label="納品予定日" required>
              <input
                type="date"
                name="expected_delivery_date"
                value={form.expected_delivery_date}
                onChange={handleFormChange}
                required
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="実納品日">
              <input
                type="date"
                name="delivered_date"
                value={form.delivered_date}
                onChange={handleFormChange}
                disabled={submitting}
                className={inputClassName}
              />
              <p className="mt-2 text-xs text-gray-500">
                納品予定日とは別です。登録日では自動入力しません。
              </p>
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
              仕入先ごとに発注書が分かれます。PRODUCTは商品行ごと、PACKAGEはパッケージ単位で仕入単価を入力します（構成部材は内訳表示のみ・金額入力なし）。
              初期値は各マスタの標準仕入先です。単価優先: 案件スナップショット →
              選択仕入先の価格マスタ → 手入力。
            </p>
            {targets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 bg-[#f7f7f5] px-4 py-8 text-center text-sm text-gray-500">
                案件に商品／パッケージ構成がありません。商品タブで追加してください。
              </div>
            ) : (
              <div className="space-y-6">
                {supplierTargetGroups.map((group, groupIndex) => {
                  const supplierName =
                    suppliers.find((s) => s.id === group.supplier_id)?.name ||
                    "名称未設定";
                  const groupLines = flattenOrderTargets(group.targets);
                  const groupAmount = sumOrderAmount(groupLines);
                  const orderNo =
                    previewOrderNumbers[groupIndex] || "（保存時に採番）";
                  return (
                    <section
                      key={group.supplier_id}
                      className="rounded-lg border border-gray-300 bg-white"
                    >
                      <header className="border-b border-gray-200 bg-[#f7f7f5] px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">
                          {formatPurchaseOrderSheetLabel(groupIndex + 1)}
                          <span className="mx-2 font-normal text-gray-400">
                            /
                          </span>
                          {supplierName}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span>
                            発注番号:{" "}
                            <span className="font-medium text-gray-900">
                              {orderNo}
                            </span>
                          </span>
                          <span>
                            発注金額合計:{" "}
                            <span className="font-medium text-gray-900">
                              {formatYen(groupAmount)}
                            </span>
                          </span>
                          <span>
                            明細件数:{" "}
                            <span className="font-medium text-gray-900">
                              {group.targets.length}件
                            </span>
                          </span>
                        </div>
                      </header>
                      <div className="space-y-4 p-4">
                        {group.targets.map((target) =>
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
                              onFieldChange={handlePackageFieldChange}
                            />
                          )
                        )}
                      </div>
                    </section>
                  );
                })}

                {missingSupplierTargets.length > 0 ? (
                  <section className="rounded-lg border border-dashed border-amber-300 bg-amber-50/40">
                    <header className="border-b border-amber-200 px-4 py-3">
                      <p className="text-sm font-bold text-amber-900">
                        仕入先未選択
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        仕入先を選択すると、対応する発注書グループに移動します。
                      </p>
                    </header>
                    <div className="space-y-4 p-4">
                      {missingSupplierTargets.map((target) =>
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
                            onFieldChange={handlePackageFieldChange}
                          />
                        )
                      )}
                    </div>
                  </section>
                ) : null}
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
                missingSupplierTargets.length > 0 ||
                orderBlockedBySettlementRule
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
            {target.manufacturer_name || "—"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            型番: {target.model_no || "—"}
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
  onFieldChange,
}: {
  target: PackageOrderTarget;
  suppliers: Supplier[];
  disabled: boolean;
  onSupplierChange: (localId: string, supplierId: string) => void;
  onFieldChange: (
    localId: string,
    field: "quantity" | "unit_price",
    value: string
  ) => void;
}) {
  const amount = packageLineAmount(target);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {target.package_name || "パッケージ"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            パッケージ単位の仕入（構成品に金額入力はありません）
            {target.has_case_snapshot ? " · 案件スナップショット単価" : ""}
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
            onChange={(e) =>
              onFieldChange(target.local_id, "unit_price", e.target.value)
            }
            disabled={disabled}
            className={`${inputClassName} mt-1`}
          />
        </label>
        <div className="block">
          <span className="text-xs font-bold text-gray-600">仕入金額</span>
          <p className="mt-1 rounded-lg border border-gray-200 bg-[#f7f7f5] px-4 py-3 text-right text-sm font-semibold text-gray-900">
            {amount == null ? "—" : formatYen(amount)}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-dashed border-gray-200 bg-[#fafafa] p-3">
        <p className="text-xs font-semibold text-gray-700">
          構成内訳（参考・金額なし）
        </p>
        <ul className="mt-2 space-y-1.5">
          {target.items.map((item) => (
            <li
              key={item.local_id}
              className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-gray-800"
            >
              <span>
                {item.manufacturer_name ? `${item.manufacturer_name} ` : ""}
                {item.product_name}
                {item.model_no ? (
                  <span className="text-xs text-gray-500">
                    {" "}
                    （{item.model_no}）
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums text-gray-600">
                × {item.quantity || "—"}
              </span>
            </li>
          ))}
        </ul>
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
