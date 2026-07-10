import Link from "next/link";

import { supabase } from "@/lib/supabase";

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

type Manufacturer = {
  name: string | null;
};

type Product = {
  name: string | null;
  model_no: string | null;
  category: string | null;
  unit: string | null;
  manufacturers: Manufacturer | Manufacturer[] | null;
};

type CaseProduct = {
  id: string;
  supplier_id: string | null;
  quantity: number | null;
  purchase_price: number | string | null;
  memo: string | null;
  products: Product | Product[] | null;
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select(`
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
    `)
    .eq("id", id)
    .single();

  if (orderError || !orderData) {
    return (
      <>
        <header className="border-b bg-white px-4 py-5 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">
            発注詳細
          </h1>
        </header>

        <main className="p-4 md:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="font-bold text-red-700">
              発注情報を取得できませんでした
            </p>

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

  let caseProducts: CaseProduct[] = [];
  let caseProductsErrorMessage = "";

  if (order.case_id) {
    const { data: caseProductData, error: caseProductError } =
      await supabase
        .from("case_products")
        .select(`
          id,
          supplier_id,
          quantity,
          purchase_price,
          memo,
          products (
            name,
            model_no,
            category,
            unit,
            manufacturers (
              name
            )
          )
        `)
        .eq("case_id", order.case_id)
        .order("created_at", {
          ascending: true,
        });

    if (caseProductError) {
      caseProductsErrorMessage = caseProductError.message;
    } else {
      const allCaseProducts =
        (caseProductData || []) as unknown as CaseProduct[];

      /*
       * 発注に仕入先が紐づいている場合は、
       * 同じ仕入先の商品を優先して表示します。
       *
       * ただし現状のordersには発注明細テーブルがないため、
       * 同じ案件・同じ仕入先の商品を発注明細として扱います。
       */
      caseProducts = order.supplier_id
        ? allCaseProducts.filter(
            (product) =>
              product.supplier_id === order.supplier_id
          )
        : allCaseProducts;
    }
  }

  const productTotal = caseProducts.reduce(
    (sum, product) => sum + toNumber(product.purchase_price),
    0
  );

  const orderAmount = toNumber(order.order_amount);

  const displayedOrderAmount =
    orderAmount > 0 ? orderAmount : productTotal;

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
          </div>
        </div>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="発注金額"
            value={formatCurrency(displayedOrderAmount)}
          />

          <SummaryCard
            label="発注ステータス"
            value={order.status || "未発注"}
          />

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
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            発注基本情報
          </h2>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Info
              label="発注番号"
              value={order.order_no}
            />

            <Info
              label="登録日時"
              value={formatDateTime(order.created_at)}
            />

            <div>
              <p className="text-xs font-bold text-gray-500">
                ステータス
              </p>

              <div className="mt-2">
                <OrderStatusBadge status={order.status} />
              </div>
            </div>

            <Info
              label="発注日"
              value={formatDate(order.order_date)}
            />

            <Info
              label="納品予定日"
              value={formatDate(order.expected_delivery_date)}
            />

            <Info
              label="納品日"
              value={formatDate(order.delivered_date)}
            />

            <Info
              label="発注金額"
              value={formatCurrency(displayedOrderAmount)}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            仕入先情報
          </h2>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Info
              label="仕入先名"
              value={supplier?.name}
            />

            <Info
              label="仕入先種別"
              value={supplier?.supplier_type}
            />

            <Info
              label="担当者"
              value={supplier?.contact_name}
            />

            <Info
              label="電話番号"
              value={supplier?.phone}
            />

            <Info
              label="メール"
              value={supplier?.email}
            />

            <Info
              label="発注方法"
              value={supplier?.order_method}
            />

            <Info
              label="締日"
              value={supplier?.closing_day}
            />

            <Info
              label="支払サイト"
              value={supplier?.payment_site}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            案件・納品情報
          </h2>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold text-gray-500">
                案件番号
              </p>

              {caseData?.id ? (
                <Link
                  href={`/cases/${caseData.id}`}
                  className="mt-1 inline-block text-sm font-bold text-blue-600 hover:underline"
                >
                  {caseData.case_no || "-"}
                </Link>
              ) : (
                <p className="mt-1 text-sm text-gray-900">
                  -
                </p>
              )}
            </div>

            <Info
              label="販売店"
              value={dealer?.name}
            />

            <Info
              label="顧客名"
              value={caseData?.customer_name}
            />

            <Info
              label="顧客電話番号"
              value={caseData?.customer_phone}
            />

            <Info
              label="施工先住所"
              value={caseData?.site_address}
            />

            <Info
              label="配送先"
              value={
                caseData?.delivery_address ||
                caseData?.site_address
              }
            />

            <Info
              label="案件希望納期"
              value={formatDate(
                caseData?.desired_delivery_date
              )}
            />

            <Info
              label="工事希望日"
              value={formatDate(
                caseData?.construction_desired_date
              )}
            />

            <Info
              label="工事内容"
              value={caseData?.construction_detail}
            />
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                発注明細
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                同一案件・同一仕入先の商品を表示しています
              </p>
            </div>

            <p className="text-sm font-bold text-gray-900">
              明細合計：{formatCurrency(productTotal)}
            </p>
          </div>

          {caseProductsErrorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              商品情報取得エラー：
              {caseProductsErrorMessage}
            </div>
          ) : caseProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-gray-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-4">
                      No.
                    </th>

                    <th className="whitespace-nowrap px-4 py-4">
                      メーカー
                    </th>

                    <th className="whitespace-nowrap px-4 py-4">
                      カテゴリ
                    </th>

                    <th className="whitespace-nowrap px-4 py-4">
                      品番
                    </th>

                    <th className="whitespace-nowrap px-4 py-4">
                      商品名
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right">
                      数量
                    </th>

                    <th className="whitespace-nowrap px-4 py-4">
                      単位
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right">
                      発注金額
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {caseProducts.map((caseProduct, index) => {
                    const product = getSingleRelation(
                      caseProduct.products
                    );

                    const manufacturer = getSingleRelation(
                      product?.manufacturers
                    );

                    return (
                      <tr
                        key={caseProduct.id}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-4 py-4">
                          {index + 1}
                        </td>

                        <td className="px-4 py-4">
                          {manufacturer?.name || "-"}
                        </td>

                        <td className="px-4 py-4">
                          {product?.category || "-"}
                        </td>

                        <td className="px-4 py-4">
                          {product?.model_no || "-"}
                        </td>

                        <td className="px-4 py-4 font-semibold text-gray-900">
                          {product?.name || "-"}
                        </td>

                        <td className="px-4 py-4 text-right">
                          {toNumber(
                            caseProduct.quantity
                          ).toLocaleString("ja-JP")}
                        </td>

                        <td className="px-4 py-4">
                          {product?.unit || "-"}
                        </td>

                        <td className="px-4 py-4 text-right font-bold">
                          {formatCurrency(
                            caseProduct.purchase_price
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500">
                この発注に表示できる商品明細がありません。
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-5 text-lg font-bold text-gray-900">
            備考
          </h2>

          <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
            {order.memo || "備考はありません。"}
          </p>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                次の操作
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                発注情報の編集や発注書PDFの作成を行います。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/orders/${order.id}/edit`}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                発注情報を編集
              </Link>

              <Link
                href={`/orders/${order.id}/print`}
                target="_blank"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
              >
                発注書PDF
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function getSingleRelation<T>(
  relation: T | T[] | null | undefined
): T | null {
  if (!relation) {
    return null;
  }

  if (Array.isArray(relation)) {
    return relation[0] || null;
  }

  return relation;
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
      <p className="text-xs font-bold text-gray-500">
        {label}
      </p>

      <p className="mt-1 break-words text-sm text-gray-900">
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
        alert
          ? "border border-red-200 bg-red-50"
          : "bg-white"
      }`}
    >
      <p
        className={`text-xs font-bold ${
          alert ? "text-red-600" : "text-gray-500"
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-2 text-2xl font-bold ${
          alert ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function OrderStatusBadge({
  status,
}: {
  status: string | null;
}) {
  const currentStatus = status || "未発注";

  const styles: Record<string, string> = {
    未発注: "bg-gray-100 text-gray-700",
    発注済: "bg-blue-100 text-blue-700",
    納期回答待ち: "bg-yellow-100 text-yellow-800",
    納期確定: "bg-purple-100 text-purple-700",
    一部納品: "bg-orange-100 text-orange-700",
    納品済: "bg-green-100 text-green-700",
    取消: "bg-gray-200 text-gray-600",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
        styles[currentStatus] ||
        "bg-gray-100 text-gray-700"
      }`}
    >
      {currentStatus}
    </span>
  );
}

function toNumber(
  value: number | string | null | undefined
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : 0;
}

function formatCurrency(
  value: number | string | null | undefined
): string {
  return `${toNumber(value).toLocaleString("ja-JP")}円`;
}

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ja-JP");
}

function formatDateTime(
  value: string | null | undefined
): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
}

function getTodayString(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}