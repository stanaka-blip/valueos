import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { listOrderItemsByOrderId } from "@/lib/repositories/orderItems";
import { formatDate, formatYen, getTodayString, toNumber } from "@/app/orders/orderUtils";
import {
  displayIdentityValue,
  resolveProductIdentity,
} from "@/app/orders/productIdentity";

export const dynamic = "force-dynamic";

type Supplier = {
  name: string | null;
  supplier_type: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  order_method: string | null;
  closing_day: string | null;
  payment_site: string | null;
};

type Dealer = {
  name: string | null;
};

type CaseData = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  site_address: string | null;
  delivery_address: string | null;
  desired_delivery_date: string | null;
  construction_desired_date: string | null;
  construction_detail: string | null;
  dealers: Dealer | Dealer[] | null;
};

type OrderDetail = {
  id: string;
  case_id: string | null;
  supplier_id: string | null;
  order_no: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  delivered_date: string | null;
  order_amount: number | string | null;
  status: string | null;
  memo: string | null;
  created_at: string | null;
  suppliers: Supplier | Supplier[] | null;
  cases: CaseData | CaseData[] | null;
};

type ProductInfo = {
  manufacturer_name: string;
  model_no: string | null;
  unit: string | null;
};

function getSingleRelation<T>(
  relation: T | T[] | null | undefined
): T | null {
  if (!relation) {
    return null;
  }
  return Array.isArray(relation) ? relation[0] || null : relation;
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select(
      `
      id,
      case_id,
      supplier_id,
      order_no,
      order_date,
      expected_delivery_date,
      delivered_date,
      order_amount,
      status,
      memo,
      created_at,
      suppliers (
        name,
        supplier_type,
        contact_name,
        phone,
        email,
        order_method,
        closing_day,
        payment_site
      ),
      cases (
        id,
        case_no,
        customer_name,
        customer_phone,
        site_address,
        delivery_address,
        desired_delivery_date,
        construction_desired_date,
        construction_detail,
        dealers (
          name
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (orderError || !orderData) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">発注詳細</h1>
        </header>
        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">発注情報を取得できませんでした</p>
            <p className="mt-2 text-sm text-red-600">
              {orderError?.message || "発注情報が見つかりません。"}
            </p>
            <Link
              href="/cases"
              className="mt-5 inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700"
            >
              案件一覧へ戻る
            </Link>
          </div>
        </main>
      </>
    );
  }

  const order = orderData as unknown as OrderDetail;
  const supplier = getSingleRelation(order.suppliers);
  const caseData = getSingleRelation(order.cases);
  const dealer = getSingleRelation(caseData?.dealers);

  const itemsResult = await listOrderItemsByOrderId(id);
  const orderItems = itemsResult.data;
  const itemsError = itemsResult.error;

  const productIds = orderItems
    .map((item) => item.product_id)
    .filter((value): value is string => Boolean(value));

  const productMap = new Map<string, ProductInfo>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, model_no, unit, manufacturers(name)")
      .in("id", productIds);

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
        model_no: identity.modelNo || null,
        unit: (product.unit as string | null) || null,
      });
    }
  }

  const itemsTotal = orderItems.reduce(
    (sum, item) => sum + toNumber(item.amount),
    0
  );
  const orderAmount = toNumber(order.order_amount);
  const displayedOrderAmount = orderAmount > 0 ? orderAmount : itemsTotal;
  const today = getTodayString();
  const isDeliveryOverdue =
    order.status !== "納品済" &&
    !!order.expected_delivery_date &&
    order.expected_delivery_date < today;

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              発注詳細：{order.order_no || "発注番号未設定"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              案件番号：{caseData?.case_no || "-"} / 仕入先：
              {supplier?.name || "-"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {caseData?.id ? (
              <Link
                href={`/cases/${caseData.id}`}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                案件詳細へ戻る
              </Link>
            ) : (
              <Link
                href="/cases"
                className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                案件一覧へ戻る
              </Link>
            )}
            <Link
              href={`/orders/${order.id}/edit`}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              編集
            </Link>
            <Link
              href={`/orders/${order.id}/print`}
              target="_blank"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
            >
              発注書PDF
            </Link>
            <Link
              href={`/orders/${order.id}/delivery-print`}
              target="_blank"
              className="rounded-lg border border-gray-900 bg-white px-4 py-2 text-sm font-bold text-gray-900 hover:bg-gray-50"
            >
              納品書PDF
            </Link>
          </div>
        </div>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="発注金額" value={formatYen(displayedOrderAmount)} />
          <SummaryCard label="発注ステータス" value={order.status || "未発注"} />
          <SummaryCard
            label="納品予定日"
            value={formatDate(order.expected_delivery_date)}
            alert={isDeliveryOverdue}
          />
          <SummaryCard
            label="納品状況"
            value={
              order.status === "納品済"
                ? "納品完了"
                : isDeliveryOverdue
                  ? "納期超過"
                  : "進行中"
            }
            alert={isDeliveryOverdue}
          />
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">発注基本情報</h2>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Info label="発注番号" value={order.order_no} />
            <Info label="ステータス" value={order.status} />
            <Info label="発注日" value={formatDate(order.order_date)} />
            <Info
              label="納品予定日"
              value={formatDate(order.expected_delivery_date)}
            />
            <Info label="納品日" value={formatDate(order.delivered_date)} />
            <Info label="発注金額" value={formatYen(displayedOrderAmount)} />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">仕入先情報</h2>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Info label="仕入先名" value={supplier?.name} />
            <Info label="仕入先種別" value={supplier?.supplier_type} />
            <Info label="担当者" value={supplier?.contact_name} />
            <Info label="電話番号" value={supplier?.phone} />
            <Info label="メール" value={supplier?.email} />
            <Info label="発注方法" value={supplier?.order_method} />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">案件・納品情報</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold text-gray-500">案件番号</p>
              {caseData?.id ? (
                <Link
                  href={`/cases/${caseData.id}`}
                  className="mt-1 inline-block text-sm font-bold text-blue-600 hover:underline"
                >
                  {caseData.case_no || "-"}
                </Link>
              ) : (
                <p className="mt-1 text-sm text-gray-900">-</p>
              )}
            </div>
            <Info label="販売店" value={dealer?.name} />
            <Info label="顧客名" value={caseData?.customer_name} />
            <Info label="顧客電話番号" value={caseData?.customer_phone} />
            <Info label="施工先住所" value={caseData?.site_address} />
            <Info
              label="配送先"
              value={caseData?.delivery_address || caseData?.site_address}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">発注明細</h2>
              <p className="mt-1 text-sm text-gray-500">
                order_items を正式表示しています
              </p>
            </div>
            <p className="text-sm font-bold text-gray-900">
              明細合計：{formatYen(itemsTotal)}
            </p>
          </div>

          {itemsError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              明細取得エラー：{itemsError}
              <span className="mt-1 block text-xs">
                supabase/migrations/20260725120000_ensure_order_items_and_rls.sql
                を適用してください。
              </span>
            </div>
          ) : orderItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3">No.</th>
                    <th className="px-4 py-3">メーカー</th>
                    <th className="px-4 py-3">型番</th>
                    <th className="px-4 py-3 text-right">数量</th>
                    <th className="px-4 py-3 text-right">仕入単価</th>
                    <th className="px-4 py-3 text-right">金額</th>
                    <th className="px-4 py-3">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, index) => {
                    const product = item.product_id
                      ? productMap.get(item.product_id)
                      : null;
                    return (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3">{index + 1}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {displayIdentityValue(product?.manufacturer_name)}
                        </td>
                        <td className="px-4 py-3">
                          {displayIdentityValue(product?.model_no)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {toNumber(item.quantity).toLocaleString("ja-JP")}
                          {product?.unit ? ` ${product.unit}` : ""}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatYen(toNumber(item.unit_price))}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          {formatYen(toNumber(item.amount))}
                        </td>
                        <td className="px-4 py-3">{item.memo || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">
              発注明細はまだありません。
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">備考</h2>
          <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
            {order.memo || "備考はありません。"}
          </p>
        </section>
      </main>
    </>
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

function SummaryCard({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-5 shadow-sm ${
        alert ? "border border-red-200 bg-red-50" : "bg-white"
      }`}
    >
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p
        className={`mt-2 text-xl font-bold ${
          alert ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
