"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type Supplier = {
  name: string | null;
  supplier_type: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
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
  construction_desired_date: string | null;
  construction_detail: string | null;
  dealers: Dealer | Dealer[] | null;
};

type OrderData = {
  id: string;
  case_id: string | null;
  supplier_id: string | null;
  order_no: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  order_amount: number | string | null;
  status: string | null;
  memo: string | null;
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
  quantity: number | string | null;
  purchase_price: number | string | null;
  memo: string | null;
  products: Product | Product[] | null;
};

export default function OrderPrintPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id || "";

  const [order, setOrder] = useState<OrderData | null>(null);
  const [caseProducts, setCaseProducts] = useState<CaseProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [productError, setProductError] = useState("");

  useEffect(() => {
    if (!orderId) {
      setLoadError("発注IDを取得できませんでした。");
      setLoading(false);
      return;
    }

    async function fetchData() {
      setLoading(true);
      setLoadError("");
      setProductError("");

      const { data: orderData, error: orderFetchError } =
        await supabase
          .from("orders")
          .select(`
            id,
            case_id,
            supplier_id,
            order_no,
            order_date,
            expected_delivery_date,
            order_amount,
            status,
            memo,
            suppliers (
              name,
              supplier_type,
              contact_name,
              phone,
              email
            ),
            cases (
              id,
              case_no,
              customer_name,
              customer_phone,
              site_address,
              delivery_address,
              construction_desired_date,
              construction_detail,
              dealers (
                name
              )
            )
          `)
          .eq("id", orderId)
          .single();

      if (orderFetchError || !orderData) {
        setLoadError(
          orderFetchError?.message ||
            "発注情報が見つかりませんでした。"
        );
        setLoading(false);
        return;
      }

      const normalizedOrder =
        orderData as unknown as OrderData;

      setOrder(normalizedOrder);

      if (!normalizedOrder.case_id) {
        setCaseProducts([]);
        setLoading(false);
        return;
      }

      const { data: productData, error: productFetchError } =
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
          .eq("case_id", normalizedOrder.case_id)
          .order("created_at", {
            ascending: true,
          });

      if (productFetchError) {
        setProductError(productFetchError.message);
        setLoading(false);
        return;
      }

      const allProducts =
        (productData || []) as unknown as CaseProduct[];

      const filteredProducts = normalizedOrder.supplier_id
        ? allProducts.filter(
            (product) =>
              product.supplier_id === normalizedOrder.supplier_id
          )
        : allProducts;

      setCaseProducts(filteredProducts);
      setLoading(false);
    }

    fetchData();
  }, [orderId]);

  const supplier = useMemo(
    () => getSingleRelation(order?.suppliers),
    [order]
  );

  const caseData = useMemo(
    () => getSingleRelation(order?.cases),
    [order]
  );

  const dealer = useMemo(
    () => getSingleRelation(caseData?.dealers),
    [caseData]
  );

  const productTotal = useMemo(
    () =>
      caseProducts.reduce(
        (sum, product) =>
          sum + toNumber(product.purchase_price),
        0
      ),
    [caseProducts]
  );

  const finalOrderAmount = useMemo(() => {
    const registeredAmount = toNumber(order?.order_amount);

    return registeredAmount > 0
      ? registeredAmount
      : productTotal;
  }, [order, productTotal]);

  const subtotal = Math.floor(finalOrderAmount / 1.1);
  const taxAmount = finalOrderAmount - subtotal;

  if (loading) {
    return (
      <main className="p-8">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          読み込み中...
        </div>
      </main>
    );
  }

  if (loadError || !order) {
    return (
      <main className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          発注情報取得エラー：
          {loadError || "発注情報が見つかりません"}
        </div>

        <Link
          href="/cases"
          className="mt-5 inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-bold text-gray-700"
        >
          案件一覧へ戻る
        </Link>
      </main>
    );
  }

  return (
    <>
      <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-4 px-4 py-5 print:hidden">
        <Link
          href={`/orders/${order.id}`}
          className="rounded-lg border bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ← 発注詳細へ戻る
        </Link>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-700"
        >
          PDFとして保存・印刷
        </button>
      </div>

      <main className="order-document mx-auto bg-white text-gray-900">
        <section className="border-b-2 border-gray-900 pb-5">
          <div className="flex items-start justify-between gap-8">
            <div>
              <h1 className="text-3xl font-bold tracking-[0.3em]">
                発 注 書
              </h1>

              <div className="mt-5 space-y-1 text-sm">
                <p>
                  発注番号：
                  <span className="font-bold">
                    {order.order_no || "-"}
                  </span>
                </p>

                <p>
                  発注日：
                  <span className="font-bold">
                    {formatDate(order.order_date)}
                  </span>
                </p>

                <p>
                  納品希望日：
                  <span className="font-bold">
                    {formatDate(
                      order.expected_delivery_date
                    )}
                  </span>
                </p>
              </div>
            </div>

            <div className="text-right text-sm leading-6">
              <p className="text-lg font-bold">
                Value Group Inc.
              </p>
              <p>〒000-0000</p>
              <p>会社住所を設定してください</p>
              <p>TEL：会社電話番号</p>
              <p>担当：担当者名</p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="border-b border-gray-700 pb-2 text-xl font-bold">
                {supplier?.name || "発注先未設定"} 御中
              </p>

              {supplier?.contact_name && (
                <p className="mt-3 text-sm">
                  ご担当：{supplier.contact_name} 様
                </p>
              )}

              {supplier?.phone && (
                <p className="mt-2 text-sm">
                  TEL：{supplier.phone}
                </p>
              )}

              {supplier?.email && (
                <p className="mt-1 text-sm">
                  Email：{supplier.email}
                </p>
              )}
            </div>

            <div className="rounded-lg border-2 border-gray-900 p-5">
              <p className="text-sm font-bold">発注金額</p>

              <p className="mt-3 text-right text-3xl font-bold">
                {formatCurrency(finalOrderAmount)}
              </p>

              <p className="mt-3 border-t pt-3 text-sm">
                納品希望日：
                <span className="ml-2 font-bold">
                  {formatDate(
                    order.expected_delivery_date
                  )}
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg bg-gray-50 p-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <Info label="案件番号" value={caseData?.case_no} />
            <Info label="販売店" value={dealer?.name} />
            <Info label="顧客名" value={caseData?.customer_name} />
            <Info
              label="顧客電話番号"
              value={caseData?.customer_phone}
            />
            <Info
              label="納品先"
              value={
                caseData?.delivery_address ||
                caseData?.site_address
              }
            />
            <Info
              label="施工先住所"
              value={caseData?.site_address}
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

        <section className="mt-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-500 px-2 py-3">
                  No.
                </th>
                <th className="border border-gray-500 px-2 py-3 text-left">
                  メーカー
                </th>
                <th className="border border-gray-500 px-2 py-3 text-left">
                  カテゴリ
                </th>
                <th className="border border-gray-500 px-2 py-3 text-left">
                  品番
                </th>
                <th className="border border-gray-500 px-2 py-3 text-left">
                  商品名
                </th>
                <th className="border border-gray-500 px-2 py-3 text-right">
                  数量
                </th>
                <th className="border border-gray-500 px-2 py-3">
                  単位
                </th>
                <th className="border border-gray-500 px-2 py-3 text-right">
                  金額
                </th>
              </tr>
            </thead>

            <tbody>
              {productError ? (
                <tr>
                  <td
                    colSpan={8}
                    className="border border-gray-500 px-3 py-6 text-center text-red-600"
                  >
                    商品情報取得エラー：{productError}
                  </td>
                </tr>
              ) : caseProducts.length > 0 ? (
                caseProducts.map((item, index) => {
                  const product = getSingleRelation(item.products);
                  const manufacturer = getSingleRelation(
                    product?.manufacturers
                  );

                  return (
                    <tr key={item.id}>
                      <td className="border border-gray-500 px-2 py-3 text-center">
                        {index + 1}
                      </td>
                      <td className="border border-gray-500 px-2 py-3">
                        {manufacturer?.name || "-"}
                      </td>
                      <td className="border border-gray-500 px-2 py-3">
                        {product?.category || "-"}
                      </td>
                      <td className="border border-gray-500 px-2 py-3">
                        {product?.model_no || "-"}
                      </td>
                      <td className="border border-gray-500 px-2 py-3">
                        <p className="font-bold">
                          {product?.name || "-"}
                        </p>

                        {item.memo && (
                          <p className="mt-1 text-xs text-gray-500">
                            {item.memo}
                          </p>
                        )}
                      </td>
                      <td className="border border-gray-500 px-2 py-3 text-right">
                        {toNumber(item.quantity).toLocaleString(
                          "ja-JP"
                        )}
                      </td>
                      <td className="border border-gray-500 px-2 py-3 text-center">
                        {product?.unit || "-"}
                      </td>
                      <td className="border border-gray-500 px-2 py-3 text-right">
                        {formatCurrency(item.purchase_price)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="border border-gray-500 px-2 py-3 text-center">
                    1
                  </td>
                  <td className="border border-gray-500 px-2 py-3">
                    -
                  </td>
                  <td className="border border-gray-500 px-2 py-3">
                    -
                  </td>
                  <td className="border border-gray-500 px-2 py-3">
                    -
                  </td>
                  <td className="border border-gray-500 px-2 py-3">
                    案件発注
                  </td>
                  <td className="border border-gray-500 px-2 py-3 text-right">
                    1
                  </td>
                  <td className="border border-gray-500 px-2 py-3 text-center">
                    式
                  </td>
                  <td className="border border-gray-500 px-2 py-3 text-right">
                    {formatCurrency(finalOrderAmount)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-6 flex justify-end">
          <table className="w-full max-w-md border-collapse text-sm">
            <tbody>
              <tr>
                <th className="border border-gray-500 bg-gray-50 px-4 py-3 text-left">
                  商品明細合計
                </th>
                <td className="border border-gray-500 px-4 py-3 text-right">
                  {formatCurrency(productTotal)}
                </td>
              </tr>

              <tr>
                <th className="border border-gray-500 bg-gray-50 px-4 py-3 text-left">
                  税抜金額
                </th>
                <td className="border border-gray-500 px-4 py-3 text-right">
                  {formatCurrency(subtotal)}
                </td>
              </tr>

              <tr>
                <th className="border border-gray-500 bg-gray-50 px-4 py-3 text-left">
                  消費税（10%）
                </th>
                <td className="border border-gray-500 px-4 py-3 text-right">
                  {formatCurrency(taxAmount)}
                </td>
              </tr>

              <tr>
                <th className="border-2 border-gray-900 bg-gray-100 px-4 py-4 text-left text-base">
                  発注金額
                </th>
                <td className="border-2 border-gray-900 px-4 py-4 text-right text-xl font-bold">
                  {formatCurrency(finalOrderAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-8 grid grid-cols-2 gap-6">
          <div className="rounded-lg border border-gray-400 p-5">
            <h2 className="font-bold">納品・配送情報</h2>

            <div className="mt-4 space-y-3">
              <Info
                label="納品希望日"
                value={formatDate(
                  order.expected_delivery_date
                )}
              />
              <Info
                label="納品先"
                value={
                  caseData?.delivery_address ||
                  caseData?.site_address
                }
              />
              <Info
                label="現場名"
                value={caseData?.customer_name}
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-400 p-5">
            <h2 className="font-bold">備考・発注条件</h2>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
              {order.memo ||
                "納品日時が確定しましたらご連絡をお願いいたします。"}
            </p>
          </div>
        </section>

        <section className="mt-10 border-t pt-5 text-xs leading-5 text-gray-500">
          <p>
            ※本発注書の内容に相違がある場合は、速やかにご連絡ください。
          </p>
          <p>
            ※納品時には発注番号を納品書へ記載してください。
          </p>
          <p>
            ※仕様・数量・納期の変更は、当社担当者の承認を得たうえで行ってください。
          </p>
        </section>
      </main>

      <style jsx global>{`
        .order-document {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
        }

        @page {
          size: A4;
          margin: 0;
        }

        @media print {
          body {
            background: white !important;
          }

          aside {
            display: none !important;
          }

          .print\\:hidden {
            display: none !important;
          }

          .order-document {
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            padding: 15mm;
          }

          tr,
          td,
          th,
          section {
            break-inside: avoid;
          }
        }
      `}</style>
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
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm text-gray-900">
        {value || "-"}
      </p>
    </div>
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