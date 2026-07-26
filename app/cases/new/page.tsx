"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { saveCaseRegistration } from "@/lib/cases/saveCaseRegistration";
import {
  PRICE_TARGET_OPTIONS,
  type PriceTargetType,
} from "@/lib/prices/targetType";
import { fetchActivePurchasePrice } from "@/lib/purchasePrices";
import { fetchActiveSalesPrice } from "@/lib/salesPrices";
import { supabase } from "@/lib/supabase";

type Dealer = {
  id: string;
  name: string | null;
  default_supplier_id: string | null;
};

type Supplier = {
  id: string;
  name: string | null;
};

type ProductOption = {
  id: string;
  name: string | null;
  model_no: string | null;
  category: string | null;
  manufacturers: { name: string | null } | { name: string | null }[] | null;
  series: { name: string | null } | { name: string | null }[] | null;
};

type PackageOption = {
  id: string;
  name: string | null;
  package_code: string | null;
  manufacturers: { name: string | null } | { name: string | null }[] | null;
  series: { name: string | null } | { name: string | null }[] | null;
};

type LineDraft = {
  localId: string;
  lineType: PriceTargetType;
  productId: string;
  packageId: string;
  supplierId: string;
  quantity: string;
  unitSalesPrice: string;
  unitPurchasePrice: string;
  salesPriceId: string | null;
  purchasePriceId: string | null;
  isManualPrice: boolean;
  salesMissing: boolean;
  purchaseMissing: boolean;
  memo: string;
  manufacturerName: string;
  seriesName: string;
  category: string;
  modelNo: string;
  displayName: string;
};

const SETTLEMENT_TYPES = ["掛売", "ローン", "現金", "カード", "その他"] as const;

function relationName(
  value: { name: string | null } | { name: string | null }[] | null | undefined
): string {
  if (!value) return "";
  if (Array.isArray(value)) return value[0]?.name || "";
  return value.name || "";
}

function createEmptyLine(defaultSupplierId = ""): LineDraft {
  return {
    localId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lineType: "PRODUCT",
    productId: "",
    packageId: "",
    supplierId: defaultSupplierId,
    quantity: "1",
    unitSalesPrice: "",
    unitPurchasePrice: "",
    salesPriceId: null,
    purchasePriceId: null,
    isManualPrice: false,
    salesMissing: false,
    purchaseMissing: false,
    memo: "",
    manufacturerName: "",
    seriesName: "",
    category: "",
    modelNo: "",
    displayName: "",
  };
}

function formatYen(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export default function NewCasePage() {
  const router = useRouter();

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    case_no: "",
    dealer_id: "",
    customer_name: "",
    customer_phone: "",
    site_address: "",
    order_type: "材工発注",
    settlement_type: "掛売",
    order_received_date: new Date().toISOString().slice(0, 10),
    desired_delivery_date: "",
    delivery_address: "",
    construction_desired_date: "",
    construction_detail: "",
    assigned_user: "",
    memo: "",
  });

  const [lines, setLines] = useState<LineDraft[]>([createEmptyLine()]);

  useEffect(() => {
    async function loadMasters() {
      setLoadingMasters(true);
      const [
        { data: dealerData, error: dealerError },
        { data: supplierData, error: supplierError },
        { data: productData, error: productError },
        { data: packageData, error: packageError },
      ] = await Promise.all([
        supabase
          .from("dealers")
          .select("id, name, default_supplier_id")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("products")
          .select(
            `
            id,
            name,
            model_no,
            category,
            manufacturers ( name ),
            series:series_id ( name )
          `
          )
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("packages")
          .select(
            `
            id,
            name,
            package_code,
            manufacturers ( name ),
            series:series_id ( name )
          `
          )
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      if (dealerError || supplierError || productError || packageError) {
        setErrorMessage(
          dealerError?.message ||
            supplierError?.message ||
            productError?.message ||
            packageError?.message ||
            "マスタ取得に失敗しました"
        );
      }

      setDealers((dealerData as Dealer[]) || []);
      setSuppliers((supplierData as Supplier[]) || []);
      setProducts((productData as ProductOption[]) || []);
      setPackages((packageData as PackageOption[]) || []);
      setLoadingMasters(false);
    }

    void loadMasters();
  }, []);

  const selectedDealer = useMemo(
    () => dealers.find((d) => d.id === form.dealer_id) || null,
    [dealers, form.dealer_id]
  );

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const qty = Number(line.quantity) || 0;
        const sales = (Number(line.unitSalesPrice) || 0) * qty;
        const purchase = (Number(line.unitPurchasePrice) || 0) * qty;
        acc.sales += sales;
        acc.purchase += purchase;
        acc.profit += sales - purchase;
        return acc;
      },
      { sales: 0, purchase: 0, profit: 0 }
    );
  }, [lines]);

  function updateLine(localId: string, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) =>
        line.localId === localId ? { ...line, ...patch } : line
      )
    );
  }

  function handleHeaderChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = e.target;
    setForm((current) => ({ ...current, [name]: value }));

    if (name === "dealer_id") {
      const dealer = dealers.find((d) => d.id === value);
      const defaultSupplierId = dealer?.default_supplier_id || "";
      setLines((current) => {
        const next = current.map((line) => ({
          ...line,
          supplierId: line.supplierId || defaultSupplierId,
          isManualPrice: false,
          salesPriceId: null,
          unitSalesPrice: "",
          salesMissing: false,
        }));
        // 販売店変更後に価格を再取得
        queueMicrotask(() => {
          for (const line of next) {
            if (line.productId || line.packageId) {
              void resolveLinePrices(line, value);
            }
          }
        });
        return next;
      });
    }
  }

  async function resolveLinePrices(line: LineDraft, dealerId: string) {
    const targetId =
      line.lineType === "PRODUCT" ? line.productId : line.packageId;
    if (!dealerId || !targetId) {
      return;
    }

    const asOfDate = form.order_received_date || undefined;

    const salesResult = await fetchActiveSalesPrice(supabase, {
      targetType: line.lineType,
      productId: line.productId || null,
      packageId: line.packageId || null,
      dealerId,
      asOfDate,
    });

    let purchaseResult = {
      found: false,
      priceId: null as string | null,
      unitPrice: 0,
      error: null as string | null,
    };

    if (line.supplierId) {
      purchaseResult = await fetchActivePurchasePrice(supabase, {
        targetType: line.lineType,
        productId: line.productId || null,
        packageId: line.packageId || null,
        supplierId: line.supplierId,
        asOfDate,
      });
    }

    updateLine(line.localId, {
      isManualPrice: false,
      salesPriceId: salesResult.found ? salesResult.priceId : null,
      unitSalesPrice: salesResult.found ? String(salesResult.unitPrice) : "",
      salesMissing: !salesResult.found,
      purchasePriceId: purchaseResult.found ? purchaseResult.priceId : null,
      unitPurchasePrice: purchaseResult.found
        ? String(purchaseResult.unitPrice)
        : "",
      purchaseMissing: Boolean(line.supplierId) && !purchaseResult.found,
    });
  }

  function handleLineTypeChange(localId: string, lineType: PriceTargetType) {
    const line = lines.find((l) => l.localId === localId);
    if (!line) return;

    const next: LineDraft = {
      ...line,
      lineType,
      productId: "",
      packageId: "",
      manufacturerName: "",
      seriesName: "",
      category: "",
      modelNo: "",
      displayName: "",
      unitSalesPrice: "",
      unitPurchasePrice: "",
      salesPriceId: null,
      purchasePriceId: null,
      isManualPrice: false,
      salesMissing: false,
      purchaseMissing: false,
    };
    updateLine(localId, next);
  }

  function handleProductOrPackageChange(localId: string, targetId: string) {
    const line = lines.find((l) => l.localId === localId);
    if (!line) return;

    if (line.lineType === "PRODUCT") {
      const product = products.find((p) => p.id === targetId);
      const next: LineDraft = {
        ...line,
        productId: targetId,
        packageId: "",
        manufacturerName: relationName(product?.manufacturers),
        seriesName: relationName(product?.series),
        category: product?.category || "",
        modelNo: product?.model_no || "",
        displayName: product?.name || "",
        isManualPrice: false,
      };
      updateLine(localId, next);
      void resolveLinePrices(next, form.dealer_id);
      return;
    }

    const pkg = packages.find((p) => p.id === targetId);
    const next: LineDraft = {
      ...line,
      packageId: targetId,
      productId: "",
      manufacturerName: relationName(pkg?.manufacturers),
      seriesName: relationName(pkg?.series),
      category: "パッケージ",
      modelNo: pkg?.package_code || "",
      displayName: pkg?.name || "",
      isManualPrice: false,
    };
    updateLine(localId, next);
    void resolveLinePrices(next, form.dealer_id);
  }

  function handleSupplierChange(localId: string, supplierId: string) {
    const line = lines.find((l) => l.localId === localId);
    if (!line) return;
    const next = { ...line, supplierId, isManualPrice: false };
    updateLine(localId, next);
    void resolveLinePrices(next, form.dealer_id);
  }

  function handleManualPriceChange(
    localId: string,
    field: "unitSalesPrice" | "unitPurchasePrice",
    value: string
  ) {
    const patch: Partial<LineDraft> = {
      [field]: value,
      isManualPrice: true,
    };
    if (field === "unitSalesPrice") {
      patch.salesPriceId = null;
      patch.salesMissing = false;
    } else {
      patch.purchasePriceId = null;
      patch.purchaseMissing = false;
    }
    updateLine(localId, patch);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setSaving(true);

    const result = await saveCaseRegistration(supabase, {
      caseNo: form.case_no,
      dealerId: form.dealer_id,
      customerName: form.customer_name,
      customerPhone: form.customer_phone.trim() || null,
      siteAddress: form.site_address.trim() || null,
      orderType: form.order_type,
      orderReceivedDate: form.order_received_date,
      desiredDeliveryDate: form.desired_delivery_date || null,
      deliveryAddress: form.delivery_address.trim() || null,
      constructionDesiredDate: form.construction_desired_date || null,
      constructionDetail: form.construction_detail.trim() || null,
      assignedUser: form.assigned_user.trim() || null,
      memo: form.memo.trim() || null,
      settlementType: form.settlement_type || null,
      lines: lines.map((line) => ({
        lineType: line.lineType,
        productId: line.productId || null,
        packageId: line.packageId || null,
        supplierId: line.supplierId || null,
        quantity: Number(line.quantity) || 0,
        unitSalesPrice: Number(line.unitSalesPrice) || 0,
        unitPurchasePrice: Number(line.unitPurchasePrice) || 0,
        // 手動変更した側のIDのみ UI 側で null 済み。未変更側のマスタIDは保持する。
        salesPriceId: line.salesPriceId,
        purchasePriceId: line.purchasePriceId,
        isManualPrice: line.isManualPrice,
        memo: line.memo.trim() || null,
        displayName: line.displayName,
      })),
    });

    setSaving(false);

    if (!result.ok) {
      setErrorMessage(result.errorMessage);
      return;
    }

    router.push(`/cases/${result.caseId}`);
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">案件登録</h1>
        <p className="text-sm text-gray-500">
          販売店からの注文を案件として登録します（複数明細・価格スナップショット）
        </p>
      </header>

      <form onSubmit={handleSubmit} className="p-6 md:p-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          {errorMessage ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <Section title="基本情報">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="案件番号">
                <input
                  name="case_no"
                  value={form.case_no}
                  onChange={handleHeaderChange}
                  placeholder="空欄なら自動採番"
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
              <Field label="販売店" required>
                <select
                  name="dealer_id"
                  value={form.dealer_id}
                  onChange={handleHeaderChange}
                  required
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                >
                  <option value="">販売店を選択</option>
                  {dealers.map((dealer) => (
                    <option key={dealer.id} value={dealer.id}>
                      {dealer.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="受注日" required>
                <input
                  name="order_received_date"
                  type="date"
                  value={form.order_received_date}
                  onChange={handleHeaderChange}
                  required
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
              <Field label="発注区分">
                <select
                  name="order_type"
                  value={form.order_type}
                  onChange={handleHeaderChange}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                >
                  <option>材料のみ</option>
                  <option>材工発注</option>
                  <option>工事のみ</option>
                  <option>見積相談</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section title="顧客・納品先">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="顧客名" required>
                <input
                  name="customer_name"
                  value={form.customer_name}
                  onChange={handleHeaderChange}
                  required
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
              <Field label="電話番号">
                <input
                  name="customer_phone"
                  value={form.customer_phone}
                  onChange={handleHeaderChange}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
              <Field label="施工先住所">
                <input
                  name="site_address"
                  value={form.site_address}
                  onChange={handleHeaderChange}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
              <Field label="配送先">
                <input
                  name="delivery_address"
                  value={form.delivery_address}
                  onChange={handleHeaderChange}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
            </div>
          </Section>

          <Section title="取引条件">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="決済区分">
                <select
                  name="settlement_type"
                  value={form.settlement_type}
                  onChange={handleHeaderChange}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                >
                  {SETTLEMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="希望納期">
                <input
                  name="desired_delivery_date"
                  type="date"
                  value={form.desired_delivery_date}
                  onChange={handleHeaderChange}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
            </div>
            {selectedDealer?.default_supplier_id ? (
              <p className="mt-3 text-xs text-gray-500">
                販売店の標準仕入先が明細の初期値に設定されます（明細ごとに変更可）。
              </p>
            ) : null}
          </Section>

          <Section
            title="商品・売上明細 / 仕入・原価"
            action={
              <button
                type="button"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    createEmptyLine(selectedDealer?.default_supplier_id || ""),
                  ])
                }
                className="rounded-lg border px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                ＋ 明細追加
              </button>
            }
          >
            {!form.dealer_id ? (
              <p className="text-sm text-amber-700">
                先に販売店を選択すると、販売価格を自動取得できます。
              </p>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-3">対象</th>
                    <th className="px-3 py-3">商品 / パッケージ</th>
                    <th className="px-3 py-3">メーカー</th>
                    <th className="px-3 py-3">シリーズ</th>
                    <th className="px-3 py-3">区分</th>
                    <th className="px-3 py-3">品番</th>
                    <th className="px-3 py-3">数量</th>
                    <th className="px-3 py-3">販売単価</th>
                    <th className="px-3 py-3">仕入先</th>
                    <th className="px-3 py-3">仕入単価</th>
                    <th className="px-3 py-3">粗利</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const qty = Number(line.quantity) || 0;
                    const sales = (Number(line.unitSalesPrice) || 0) * qty;
                    const purchase =
                      (Number(line.unitPurchasePrice) || 0) * qty;
                    const profit = sales - purchase;

                    return (
                      <tr key={line.localId} className="border-t align-top">
                        <td className="px-3 py-3">
                          <select
                            value={line.lineType}
                            onChange={(e) =>
                              handleLineTypeChange(
                                line.localId,
                                e.target.value as PriceTargetType
                              )
                            }
                            className="min-w-[120px] rounded-lg border px-3 py-2 text-sm"
                          >
                            {PRICE_TARGET_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={
                              line.lineType === "PRODUCT"
                                ? line.productId
                                : line.packageId
                            }
                            onChange={(e) =>
                              handleProductOrPackageChange(
                                line.localId,
                                e.target.value
                              )
                            }
                            required
                            className="min-w-[220px] rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">
                              {line.lineType === "PRODUCT"
                                ? "商品を選択"
                                : "パッケージ商品を選択"}
                            </option>
                            {line.lineType === "PRODUCT"
                              ? products.map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {relationName(product.manufacturers) || "-"}{" "}
                                    / {product.model_no || "-"} /{" "}
                                    {product.name || "-"}
                                  </option>
                                ))
                              : packages.map((pkg) => (
                                  <option key={pkg.id} value={pkg.id}>
                                    {relationName(pkg.manufacturers) || "-"} /{" "}
                                    {pkg.package_code || "-"} /{" "}
                                    {pkg.name || "-"}
                                  </option>
                                ))}
                          </select>
                          <p className="mt-1 text-xs text-gray-500">
                            {line.displayName || "—"}
                          </p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {line.manufacturerName || "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {line.seriesName || "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {line.category || "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {line.modelNo || "—"}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.localId, {
                                quantity: e.target.value,
                              })
                            }
                            required
                            className="w-20 rounded-lg border px-2 py-2 text-sm"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={line.unitSalesPrice}
                            onChange={(e) =>
                              handleManualPriceChange(
                                line.localId,
                                "unitSalesPrice",
                                e.target.value
                              )
                            }
                            className="w-28 rounded-lg border px-2 py-2 text-sm"
                          />
                          {line.salesMissing ? (
                            <p className="mt-1 text-xs font-semibold text-red-600">
                              販売価格が登録されていません
                            </p>
                          ) : null}
                          {line.isManualPrice ? (
                            <p className="mt-1 text-xs text-amber-700">手動変更</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={line.supplierId}
                            onChange={(e) =>
                              handleSupplierChange(line.localId, e.target.value)
                            }
                            required
                            className="min-w-[140px] rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">仕入先を選択</option>
                            {suppliers.map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={line.unitPurchasePrice}
                            onChange={(e) =>
                              handleManualPriceChange(
                                line.localId,
                                "unitPurchasePrice",
                                e.target.value
                              )
                            }
                            className="w-28 rounded-lg border px-2 py-2 text-sm"
                          />
                          {line.purchaseMissing ? (
                            <p className="mt-1 text-xs text-amber-700">
                              仕入価格マスタなし
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap font-semibold">
                          {formatYen(profit)}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            disabled={lines.length <= 1}
                            onClick={() =>
                              setLines((current) =>
                                current.filter((l) => l.localId !== line.localId)
                              )
                            }
                            className="text-xs font-bold text-red-600 disabled:opacity-40"
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

            <div className="mt-4 grid gap-3 border-t pt-4 text-sm md:grid-cols-3">
              <Summary label="売上合計" value={formatYen(totals.sales)} />
              <Summary label="仕入合計" value={formatYen(totals.purchase)} />
              <Summary label="粗利合計" value={formatYen(totals.profit)} />
            </div>
          </Section>

          <Section title="納品・施工">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="工事希望日">
                <input
                  name="construction_desired_date"
                  type="date"
                  value={form.construction_desired_date}
                  onChange={handleHeaderChange}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="工事内容">
                  <textarea
                    name="construction_detail"
                    value={form.construction_detail}
                    onChange={handleHeaderChange}
                    rows={3}
                    className="w-full rounded-lg border px-4 py-3 text-sm"
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="担当・メモ">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="担当者">
                <input
                  name="assigned_user"
                  value={form.assigned_user}
                  onChange={handleHeaderChange}
                  className="w-full rounded-lg border px-4 py-3 text-sm"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="備考">
                  <textarea
                    name="memo"
                    value={form.memo}
                    onChange={handleHeaderChange}
                    rows={4}
                    className="w-full rounded-lg border px-4 py-3 text-sm"
                  />
                </Field>
              </div>
            </div>
          </Section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push("/cases")}
              className="rounded-lg border px-5 py-3 text-sm font-bold text-gray-700"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || loadingMasters}
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "登録中..." : "案件を登録する"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3 border-b pb-3">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-gray-700">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </p>
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-base font-bold text-gray-900">{value}</p>
    </div>
  );
}
