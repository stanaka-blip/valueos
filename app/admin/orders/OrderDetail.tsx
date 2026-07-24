"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

import { displayValue, parseCaseExtras } from "./parseCaseExtras";
import {
  getStatusBadgeClassName,
  getStatusDisplayLabel,
} from "./status";

type NamedRelation = {
  name: string | null;
  model_no?: string | null;
} | null;

type CasePackageItemRow = {
  id: string;
  quantity: number | null;
  is_selected: boolean | null;
  is_added_manually: boolean | null;
  is_hidden: boolean | null;
  product_name_snapshot: string | null;
  model_no_snapshot: string | null;
  display_name_snapshot: string | null;
  products: NamedRelation | NamedRelation[];
};

type CasePackageRow = {
  id: string;
  quantity: number | null;
  memo: string | null;
  package_name_snapshot: string | null;
  package_code_snapshot: string | null;
  manufacturer_name_snapshot: string | null;
  series_name_snapshot: string | null;
  packages:
    | {
        name: string | null;
        package_code: string | null;
      }
    | {
        name: string | null;
        package_code: string | null;
      }[]
    | null;
  case_package_items: CasePackageItemRow[] | null;
};

type CaseProductRow = {
  id: string;
  quantity: number | null;
  memo: string | null;
  products:
    | {
        name: string | null;
        model_no: string | null;
      }
    | {
        name: string | null;
        model_no: string | null;
      }[]
    | null;
};

type CaseDetailRow = {
  id: string;
  case_no: string | null;
  created_at: string | null;
  status: string | null;
  order_type: string | null;
  product_name: string | null;
  quantity: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  site_address: string | null;
  desired_delivery_date: string | null;
  construction_desired_date: string | null;
  delivery_address: string | null;
  construction_detail: string | null;
  assigned_user: string | null;
  memo: string | null;
  dealers:
    | {
        name: string | null;
        contact_name: string | null;
      }
    | {
        name: string | null;
        contact_name: string | null;
      }[]
    | null;
  case_packages: CasePackageRow[] | null;
  case_products: CaseProductRow[] | null;
};

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] || null : value;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "未登録";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "未登録";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ja-JP");
}

function getItemName(item: CasePackageItemRow): string {
  if (item.display_name_snapshot) {
    return item.display_name_snapshot;
  }

  if (item.product_name_snapshot) {
    return item.product_name_snapshot;
  }

  const product = getSingleRelation(item.products);
  return product?.name || "未登録";
}

function getItemModel(item: CasePackageItemRow): string {
  if (item.model_no_snapshot) {
    return item.model_no_snapshot;
  }

  const product = getSingleRelation(item.products);
  return product?.model_no || "未登録";
}

function getProductName(row: CaseProductRow): string {
  const product = getSingleRelation(row.products);
  return product?.name || "未登録";
}

function getProductModel(row: CaseProductRow): string {
  const product = getSingleRelation(row.products);
  return product?.model_no || "未登録";
}

type OrderDetailProps = {
  orderId: string;
};

export default function OrderDetail({ orderId }: OrderDetailProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [caseData, setCaseData] = useState<CaseDetailRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setLoading(true);
      setErrorMessage("");
      setNotFound(false);
      setCaseData(null);

      const { data, error } = await supabase
        .from("cases")
        .select(
          `
          id,
          case_no,
          created_at,
          status,
          order_type,
          product_name,
          quantity,
          customer_name,
          customer_phone,
          site_address,
          desired_delivery_date,
          construction_desired_date,
          delivery_address,
          construction_detail,
          assigned_user,
          memo,
          dealers (
            name,
            contact_name
          ),
          case_packages (
            id,
            quantity,
            memo,
            package_name_snapshot,
            package_code_snapshot,
            manufacturer_name_snapshot,
            series_name_snapshot,
            packages (
              name,
              package_code
            ),
            case_package_items (
              id,
              quantity,
              is_selected,
              is_added_manually,
              is_hidden,
              product_name_snapshot,
              model_no_snapshot,
              display_name_snapshot,
              products (
                name,
                model_no
              )
            )
          ),
          case_products (
            id,
            quantity,
            memo,
            products (
              name,
              model_no
            )
          )
        `
        )
        .eq("id", orderId)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("受注詳細の取得に失敗しました:", error);
        setErrorMessage("受注データの取得に失敗しました");
        setLoading(false);
        return;
      }

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setCaseData(data as CaseDetailRow);
      setLoading(false);
    }

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="rounded-xl bg-white p-8 text-sm text-gray-600 shadow-sm">
        読み込み中...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {errorMessage}
        </div>
        <BackLink />
      </div>
    );
  }

  if (notFound || !caseData) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          受注データが見つかりません
        </div>
        <BackLink />
      </div>
    );
  }

  const dealer = getSingleRelation(caseData.dealers);
  const extras = parseCaseExtras({
    memo: caseData.memo,
    constructionDetail: caseData.construction_detail,
  });

  const dealerContact =
    extras.dealerContact ||
    caseData.assigned_user ||
    dealer?.contact_name ||
    null;

  const casePackages = Array.isArray(caseData.case_packages)
    ? caseData.case_packages
    : [];
  const caseProducts = Array.isArray(caseData.case_products)
    ? caseData.case_products
    : [];

  const isPackageOrder =
    caseData.order_type === "パッケージで発注" || casePackages.length > 0;
  const isPartsOrder =
    caseData.order_type === "部材のみ発注" ||
    (!isPackageOrder && caseProducts.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">受注詳細</h1>
            <p className="mt-2 text-sm text-gray-500">案件番号</p>
            <p className="text-lg font-bold text-gray-900">
              {displayValue(caseData.case_no)}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getStatusBadgeClassName(caseData.status)}`}
            >
              {getStatusDisplayLabel(caseData.status)}
            </span>
            <p className="text-sm text-gray-500">
              登録日時：{formatDateTime(caseData.created_at)}
            </p>
          </div>
        </div>
      </section>

      <SectionCard title="案件情報">
        <InfoGrid>
          <InfoItem label="案件番号" value={caseData.case_no} />
          <InfoItem label="販売店名" value={dealer?.name} />
          <InfoItem label="販売店担当者" value={dealerContact} />
          <InfoItem label="顧客名" value={caseData.customer_name} />
          <InfoItem label="顧客名カナ" value={extras.customerNameKana} />
          <InfoItem label="電話番号" value={caseData.customer_phone} />
          <InfoItem label="郵便番号" value={extras.postalCode} />
          <InfoItem label="設置住所" value={caseData.site_address} />
          <div className="md:col-span-2">
            <InfoItem
              label="備考"
              value={resolveCaseMemoDisplay(extras.caseMemo, caseData.memo)}
            />
          </div>
        </InfoGrid>
      </SectionCard>

      <SectionCard title="工事・納品情報">
        <InfoGrid>
          <InfoItem
            label="希望納品日"
            value={
              caseData.desired_delivery_date
                ? formatDate(caseData.desired_delivery_date)
                : null
            }
          />
          <InfoItem
            label="工事予定日"
            value={
              caseData.construction_desired_date
                ? formatDate(caseData.construction_desired_date)
                : null
            }
          />
          <InfoItem label="施工会社" value={extras.contractorName} />
          <InfoItem label="納品先住所" value={caseData.delivery_address} />
          <InfoItem label="受取人" value={extras.receiverName} />
        </InfoGrid>
      </SectionCard>

      <SectionCard title="商品情報">
        <p className="mb-4 text-sm text-gray-600">
          注文種別：{displayValue(caseData.order_type)}
        </p>

        {isPackageOrder ? (
          <PackageOrderSections packages={casePackages} />
        ) : null}

        {isPartsOrder ? (
          <PartsOrderSection products={caseProducts} />
        ) : null}

        {!isPackageOrder && !isPartsOrder ? (
          <div className="space-y-3 text-sm text-gray-700">
            <InfoItem label="商品概要" value={caseData.product_name} />
            <InfoItem
              label="数量"
              value={
                caseData.quantity != null ? String(caseData.quantity) : null
              }
            />
            <p className="text-gray-500">
              パッケージ／部材の明細データは登録されていません。
            </p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="添付資料">
        <p className="text-sm text-gray-500">添付資料はありません</p>
      </SectionCard>
    </div>
  );
}

function PackageOrderSections({ packages }: { packages: CasePackageRow[] }) {
  if (packages.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        パッケージ情報が登録されていません。
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {packages.map((pkg, index) => {
        const relatedPackage = getSingleRelation(pkg.packages);
        const packageName =
          pkg.package_name_snapshot || relatedPackage?.name || null;

        const items = Array.isArray(pkg.case_package_items)
          ? pkg.case_package_items
          : [];

        const baseItems = items.filter(
          (item) =>
            item.is_added_manually !== true &&
            item.is_selected !== false &&
            item.is_hidden !== true
        );
        const addedItems = items.filter(
          (item) => item.is_added_manually === true
        );
        const excludedItems = items.filter(
          (item) =>
            item.is_selected === false ||
            (item.is_hidden === true && item.is_added_manually !== true)
        );

        return (
          <div key={pkg.id} className="space-y-4">
            {packages.length > 1 ? (
              <h3 className="text-sm font-bold text-gray-800">
                パッケージ {index + 1}
              </h3>
            ) : null}

            <InfoGrid>
              <InfoItem
                label="メーカー"
                value={pkg.manufacturer_name_snapshot}
              />
              <InfoItem label="シリーズ" value={pkg.series_name_snapshot} />
              <InfoItem label="パッケージ名" value={packageName} />
              <InfoItem
                label="数量"
                value={pkg.quantity != null ? String(pkg.quantity) : null}
              />
              <div className="md:col-span-2">
                <InfoItem label="商品備考" value={pkg.memo} />
              </div>
            </InfoGrid>

            <ItemTable
              title="パッケージ構成商品"
              items={baseItems}
              emptyMessage="構成商品は登録されていません。"
            />

            {addedItems.length > 0 ? (
              <ItemTable title="追加商品" items={addedItems} />
            ) : null}

            {excludedItems.length > 0 ? (
              <ItemTable title="除外商品" items={excludedItems} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PartsOrderSection({ products }: { products: CaseProductRow[] }) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-gray-500">部材情報が登録されていません。</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="border-b bg-gray-50 text-gray-500">
          <tr>
            <th className="px-4 py-3">商品名</th>
            <th className="px-4 py-3">型番</th>
            <th className="px-4 py-3">数量</th>
          </tr>
        </thead>
        <tbody>
          {products.map((row) => (
            <tr key={row.id} className="border-b last:border-b-0">
              <td className="px-4 py-3 text-gray-900">{getProductName(row)}</td>
              <td className="px-4 py-3 text-gray-700">{getProductModel(row)}</td>
              <td className="px-4 py-3 text-gray-700">
                {row.quantity != null ? row.quantity : "未登録"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemTable({
  title,
  items,
  emptyMessage = "該当する商品はありません。",
}: {
  title: string;
  items: CasePackageItemRow[];
  emptyMessage?: string;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-bold text-gray-800">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3">商品名</th>
                <th className="px-4 py-3">型番</th>
                <th className="px-4 py-3">数量</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 text-gray-900">
                    {getItemName(item)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {getItemModel(item)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {item.quantity != null ? item.quantity : "未登録"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function resolveCaseMemoDisplay(
  parsedCaseMemo: string | null,
  rawMemo: string | null | undefined
): string | null {
  if (parsedCaseMemo) {
    return parsedCaseMemo;
  }

  if (!rawMemo || !rawMemo.trim()) {
    return null;
  }

  // Structured memo without 案件備考 should not dump all labeled fields.
  if (rawMemo.includes("【")) {
    return null;
  }

  return rawMemo.trim();
}

function BackLink() {
  return (
    <Link
      href="/admin/orders"
      className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
    >
      受注一覧へ戻る
    </Link>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
      <h2 className="mb-5 text-lg font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function InfoGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">
        {displayValue(value)}
      </p>
    </div>
  );
}
