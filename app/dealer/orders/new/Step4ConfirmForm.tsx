"use client";

import { ReactNode, useEffect, useState } from "react";

import {
  DealerOrderCaseForm,
  DealerOrderProductForm,
} from "./types";
import {
  fetchActiveManufacturers,
  fetchActivePackages,
  fetchActiveProductSeries,
  fetchActiveProducts,
  fetchPackageItems,
  formatPackageItemLabel,
  formatPackageLabel,
  formatProductLabel,
  type PackageItemOption,
} from "./productMaster";

type Step4ConfirmFormProps = {
  caseForm: DealerOrderCaseForm;
  productForm: DealerOrderProductForm;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
};

export default function Step4ConfirmForm({
  caseForm,
  productForm,
  onBack,
  onSubmit,
  submitting,
}: Step4ConfirmFormProps) {
  const [manufacturerName, setManufacturerName] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [packageName, setPackageName] = useState("");
  const [packageItems, setPackageItems] = useState<PackageItemOption[]>([]);
  const [partLabels, setPartLabels] = useState<
    Array<{ local_id: string; label: string; quantity: string; memo: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadLabels() {
      setLoading(true);

      const [manufacturers, seriesList, packages, products] = await Promise.all([
        fetchActiveManufacturers(),
        fetchActiveProductSeries(),
        fetchActivePackages(),
        fetchActiveProducts(),
      ]);

      if (cancelled) {
        return;
      }

      const manufacturer = manufacturers.data.find(
        (item) => item.id === productForm.manufacturer_id
      );
      setManufacturerName(manufacturer?.name || "-");

      if (productForm.order_category === "パッケージで発注") {
        const series = seriesList.data.find(
          (item) => item.id === productForm.series_id
        );
        setSeriesName(series?.name || "シリーズなし");

        const pkg = packages.data.find(
          (item) => item.id === productForm.package_id
        );
        setPackageName(pkg ? formatPackageLabel(pkg) : "-");

        if (productForm.package_id) {
          const items = await fetchPackageItems(productForm.package_id);
          if (!cancelled) {
            setPackageItems(items.data);
          }
        } else {
          setPackageItems([]);
        }
      } else {
        setSeriesName("");
        setPackageName("");
        setPackageItems([]);

        const labels = productForm.part_lines.map((line) => {
          const product = products.data.find(
            (item) => item.id === line.product_id
          );
          return {
            local_id: line.local_id,
            label: product ? formatProductLabel(product) : "-",
            quantity: line.quantity,
            memo: line.product_memo,
          };
        });
        setPartLabels(labels);
      }

      setLoading(false);
    }

    loadLabels();

    return () => {
      cancelled = true;
    };
  }, [productForm]);

  return (
    <div className="space-y-6">
      <SectionCard title="入力内容の確認">
        <p className="mb-5 text-sm text-gray-600">
          内容をご確認のうえ、「発注依頼を送信」を押してください。送信時にのみ保存されます。
        </p>

        {loading ? (
          <p className="text-sm text-gray-600">読み込み中...</p>
        ) : (
          <div className="space-y-6">
            <ConfirmBlock title="販売店情報">
              <ConfirmRow label="販売店名" value={caseForm.dealer_name} />
              <ConfirmRow
                label="販売店担当者"
                value={caseForm.dealer_contact}
              />
            </ConfirmBlock>

            <ConfirmBlock title="顧客情報">
              <ConfirmRow label="顧客名" value={caseForm.customer_name} />
              <ConfirmRow
                label="顧客名カナ"
                value={caseForm.customer_name_kana || "-"}
              />
              <ConfirmRow label="電話番号" value={caseForm.customer_phone} />
              <ConfirmRow
                label="郵便番号"
                value={caseForm.postal_code || "-"}
              />
              <ConfirmRow label="設置先住所" value={caseForm.site_address} />
            </ConfirmBlock>

            <ConfirmBlock title="日程情報">
              <ConfirmRow
                label="希望納品日"
                value={caseForm.desired_delivery_date}
              />
              <ConfirmRow
                label="工事予定日"
                value={caseForm.construction_date}
              />
            </ConfirmBlock>

            <ConfirmBlock title="納品情報">
              <ConfirmRow label="納品先区分" value={caseForm.delivery_type} />
              <ConfirmRow
                label="納品先名称"
                value={caseForm.delivery_name || "-"}
              />
              <ConfirmRow
                label="納品先住所"
                value={caseForm.delivery_address}
              />
              <ConfirmRow
                label="荷受け担当者"
                value={caseForm.receiver_name}
              />
              <ConfirmRow
                label="荷受け電話番号"
                value={caseForm.receiver_phone}
              />
              <ConfirmRow
                label="荷受け可能時間"
                value={caseForm.receiving_hours || "-"}
              />
              <ConfirmRow
                label="納品時の注意事項"
                value={caseForm.delivery_notes || "-"}
              />
            </ConfirmBlock>

            <ConfirmBlock title="商品情報">
              <ConfirmRow
                label="発注区分"
                value={productForm.order_category}
              />

              {productForm.order_category === "パッケージで発注" ? (
                <>
                  <ConfirmRow label="メーカー" value={manufacturerName} />
                  <ConfirmRow label="シリーズ" value={seriesName} />
                  <ConfirmRow label="パッケージ" value={packageName} />
                  <ConfirmRow label="数量" value={productForm.quantity} />
                  <ConfirmRow
                    label="商品備考"
                    value={productForm.product_memo || "-"}
                  />
                  <div className="md:col-span-2">
                    <p className="text-xs font-bold text-gray-500">
                      パッケージ内容
                    </p>
                    {packageItems.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-700">なし</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {packageItems.map((item) => (
                          <li
                            key={item.id}
                            className="text-sm text-gray-800"
                          >
                            {formatPackageItemLabel(item)} × {item.quantity}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : null}

              {productForm.order_category === "部材のみ発注" ? (
                <div className="md:col-span-2 space-y-3">
                  {partLabels.map((line, index) => (
                    <div
                      key={line.local_id}
                      className="rounded-lg border border-gray-200 p-3"
                    >
                      <p className="text-sm font-bold text-gray-800">
                        部材 {index + 1}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">
                        {line.label} × {line.quantity}
                      </p>
                      {line.memo ? (
                        <p className="mt-1 text-xs text-gray-500">
                          備考: {line.memo}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </ConfirmBlock>

            {caseForm.case_memo.trim() ? (
              <ConfirmBlock title="備考">
                <ConfirmRow label="案件備考" value={caseForm.case_memo} />
              </ConfirmBlock>
            ) : null}
          </div>
        )}
      </SectionCard>

      <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          戻る
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || loading}
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "送信中..." : "発注依頼を送信"}
        </button>
      </div>
    </div>
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

function ConfirmBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 border-b border-gray-200 pb-2 text-sm font-bold text-gray-900">
        {title}
      </h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
        {value || "-"}
      </p>
    </div>
  );
}
