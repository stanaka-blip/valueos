import Link from "next/link";

import { supabase } from "@/lib/supabase";

import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

type Dealer = {
  name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type CaseData = {
  id: string;
  case_no: string | null;
  customer_name: string | null;
  site_address: string | null;
  dealers: Dealer | Dealer[] | null;
};

type Invoice = {
  id: string;
  case_id: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_amount: number | string | null;
  memo: string | null;
  cases: CaseData | CaseData[] | null;
};

type Manufacturer = {
  name: string | null;
};

type Product = {
  name: string | null;
  model_no: string | null;
  manufacturers: Manufacturer | Manufacturer[] | null;
};

type CaseProduct = {
  id: string;
  quantity: number | null;
  sales_price: number | string | null;
  products: Product | Product[] | null;
};

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: invoiceData, error: invoiceError } =
    await supabase
      .from("invoices")
      .select(`
        id,
        case_id,
        invoice_no,
        invoice_date,
        due_date,
        invoice_amount,
        memo,
        cases (
          id,
          case_no,
          customer_name,
          site_address,
          dealers (
            name,
            contact_name,
            phone,
            email,
            address
          )
        )
      `)
      .eq("id", id)
      .single();

  if (invoiceError || !invoiceData) {
    return (
      <main className="p-8">
        <div className="rounded-lg bg-red-50 p-6 text-red-700">
          請求情報取得エラー：
          {invoiceError?.message || "請求情報が見つかりません"}
        </div>
      </main>
    );
  }

  const invoice = invoiceData as unknown as Invoice;
  const caseData = getSingleRelation(invoice.cases);
  const dealer = getSingleRelation(caseData?.dealers);

  const { data: productData, error: productError } =
    await supabase
      .from("case_products")
      .select(`
        id,
        quantity,
        sales_price,
        products (
          name,
          model_no,
          manufacturers (
            name
          )
        )
      `)
      .eq("case_id", invoice.case_id || "")
      .order("created_at", {
        ascending: true,
      });

  const caseProducts =
    (productData || []) as unknown as CaseProduct[];

  const invoiceAmount = toNumber(invoice.invoice_amount);

  /*
   * 現在のValueOSではcase_products.sales_priceに
   * 数量込み販売合計が保存されています。
   */
  const productTotal = caseProducts.reduce(
    (sum, item) => sum + toNumber(item.sales_price),
    0
  );

  /*
   * 初期版は請求金額を税込総額として扱い、
   * 10%対象の税抜・消費税を逆算表示します。
   */
  const subtotal = Math.floor(invoiceAmount / 1.1);
  const taxAmount = invoiceAmount - subtotal;

  return (
    <>
      <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-4 px-4 py-5 print:hidden">
        <Link
          href={`/invoices/${invoice.id}`}
          className="rounded-lg border bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ← 請求詳細へ戻る
        </Link>

        <PrintButton />
      </div>

      <main className="invoice-page mx-auto bg-white text-gray-900">
        <section className="border-b-2 border-gray-900 pb-5">
          <div className="flex items-start justify-between gap-8">
            <div>
              <h1 className="text-3xl font-bold tracking-[0.3em]">
                請 求 書
              </h1>

              <p className="mt-5 text-sm">
                請求番号：{invoice.invoice_no || "-"}
              </p>

              <p className="mt-1 text-sm">
                請求日：{formatDate(invoice.invoice_date)}
              </p>
            </div>

            <div className="text-right text-sm leading-6">
              <p className="text-lg font-bold">
                Value Group Inc.
              </p>

              <p>〒000-0000</p>
              <p>会社住所を設定してください</p>
              <p>TEL：会社電話番号</p>
              <p>登録番号：T0000000000000</p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="border-b border-gray-700 pb-2 text-xl font-bold">
                {dealer?.name || "請求先未設定"} 御中
              </p>

              {dealer?.address ? (
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {dealer.address}
                </p>
              ) : null}

              {dealer?.contact_name ? (
                <p className="mt-2 text-sm">
                  ご担当：{dealer.contact_name} 様
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border-2 border-gray-900 p-5">
              <p className="text-sm font-bold">
                ご請求金額
              </p>

              <p className="mt-3 text-right text-3xl font-bold">
                {formatCurrency(invoiceAmount)}
              </p>

              <p className="mt-3 border-t pt-3 text-sm">
                お支払期限：
                <span className="ml-2 font-bold">
                  {formatDate(invoice.due_date)}
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg bg-gray-50 p-4 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <Info
              label="案件番号"
              value={caseData?.case_no}
            />

            <Info
              label="顧客名"
              value={caseData?.customer_name}
            />

            <Info
              label="施工先住所"
              value={caseData?.site_address}
            />
          </div>
        </section>

        <section className="mt-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-500 px-3 py-3 text-left">
                  No.
                </th>

                <th className="border border-gray-500 px-3 py-3 text-left">
                  メーカー
                </th>

                <th className="border border-gray-500 px-3 py-3 text-left">
                  商品名・型式
                </th>

                <th className="border border-gray-500 px-3 py-3 text-right">
                  数量
                </th>

                <th className="border border-gray-500 px-3 py-3 text-right">
                  金額
                </th>
              </tr>
            </thead>

            <tbody>
              {productError ? (
                <tr>
                  <td
                    colSpan={5}
                    className="border border-gray-500 px-3 py-5 text-center text-red-600"
                  >
                    商品情報取得エラー：{productError.message}
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
                      <td className="border border-gray-500 px-3 py-3">
                        {index + 1}
                      </td>

                      <td className="border border-gray-500 px-3 py-3">
                        {manufacturer?.name || "-"}
                      </td>

                      <td className="border border-gray-500 px-3 py-3">
                        <p className="font-bold">
                          {product?.name || "-"}
                        </p>

                        <p className="mt-1 text-xs text-gray-600">
                          {product?.model_no || "-"}
                        </p>
                      </td>

                      <td className="border border-gray-500 px-3 py-3 text-right">
                        {Number(item.quantity || 0).toLocaleString(
                          "ja-JP"
                        )}
                      </td>

                      <td className="border border-gray-500 px-3 py-3 text-right">
                        {formatCurrency(item.sales_price)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="border border-gray-500 px-3 py-3">
                    1
                  </td>

                  <td className="border border-gray-500 px-3 py-3">
                    -
                  </td>

                  <td className="border border-gray-500 px-3 py-3">
                    案件請求金額
                  </td>

                  <td className="border border-gray-500 px-3 py-3 text-right">
                    1
                  </td>

                  <td className="border border-gray-500 px-3 py-3 text-right">
                    {formatCurrency(invoiceAmount)}
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
                  ご請求金額
                </th>

                <td className="border-2 border-gray-900 px-4 py-4 text-right text-xl font-bold">
                  {formatCurrency(invoiceAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-gray-400 p-5">
            <h2 className="font-bold">お振込先</h2>

            <div className="mt-4 space-y-2 text-sm">
              <p>銀行名：設定してください</p>
              <p>支店名：設定してください</p>
              <p>口座種別：普通</p>
              <p>口座番号：設定してください</p>
              <p>口座名義：設定してください</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-400 p-5">
            <h2 className="font-bold">備考</h2>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
              {invoice.memo ||
                "振込手数料は貴社にてご負担くださいますようお願いいたします。"}
            </p>
          </div>
        </section>
      </main>

      <style>{`
        .invoice-page {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
        }

        @page {
          size: A4;
          margin: 0;
        }

        @media print {
          html,
          body {
            background: white !important;
          }

          body * {
            visibility: hidden;
          }

          .invoice-page,
          .invoice-page * {
            visibility: visible;
          }

          .invoice-page {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            padding: 15mm;
            box-shadow: none;
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
      <p className="text-xs font-bold text-gray-500">
        {label}
      </p>

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