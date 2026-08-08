"use client";

import type {
  DealerOption,
  PackageOption,
  ProductOption,
} from "./masters";
import { formatPackageLabel, formatProductLabel } from "./masters";
import type {
  CaseFormState,
  LineDraft,
  SettlementFormState,
  SettlementType,
} from "./types";
import { resolvedDeliveryAddress } from "./validation";

type Props = {
  caseForm: CaseFormState;
  lines: LineDraft[];
  settlement: SettlementFormState & { settlement_type: SettlementType };
  dealers: DealerOption[];
  products: ProductOption[];
  packages: PackageOption[];
  submitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onSubmit: () => void;
};

export default function Step4ConfirmForm({
  caseForm,
  lines,
  settlement,
  dealers,
  products,
  packages,
  submitting,
  submitError,
  onBack,
  onSubmit,
}: Props) {
  const dealerName = dealers.find((d) => d.id === caseForm.dealer_id)?.name || "—";

  return (
    <div className="space-y-6">
      {submitError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </div>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-900">案件情報</h2>
        <dl className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">販売店</dt>
            <dd>{dealerName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">顧客名</dt>
            <dd>{caseForm.customer_name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">お客様電話番号</dt>
            <dd>{caseForm.customer_phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">施工店名</dt>
            <dd>{caseForm.contractor_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">受注日</dt>
            <dd>{caseForm.order_received_date}</dd>
          </div>
          <div>
            <dt className="text-gray-500">希望納品日</dt>
            <dd>{caseForm.desired_delivery_date || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">工事希望日</dt>
            <dd>{caseForm.construction_desired_date || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">販売店担当者</dt>
            <dd>{caseForm.assigned_user || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">設置先</dt>
            <dd>{caseForm.site_address}</dd>
          </div>
          <div>
            <dt className="text-gray-500">納品先名称</dt>
            <dd>{caseForm.delivery_name || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">納品先</dt>
            <dd>{resolvedDeliveryAddress(caseForm) || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">納品先電話番号</dt>
            <dd>{caseForm.delivery_phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">荷受け担当者</dt>
            <dd>{caseForm.receiver_name || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-900">決済</h2>
        <dl className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">決済区分</dt>
            <dd className="font-medium">{settlement.settlement_type}</dd>
          </div>
          {settlement.settlement_type === "3社間決済" ? (
            <>
              <div>
                <dt className="text-gray-500">信販会社</dt>
                <dd>{settlement.finance_company.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">承認番号</dt>
                <dd>{settlement.approval_number.trim() || "—"}</dd>
              </div>
            </>
          ) : null}
          {settlement.settlement_type === "カード" ? (
            <div>
              <dt className="text-gray-500">カード会社名</dt>
              <dd>{settlement.card_brand.trim() || "—"}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-900">明細</h2>
        <ul className="space-y-3 text-sm">
          {lines.map((line) => {
            const name =
              line.display_name ||
              (line.line_type === "PRODUCT"
                ? formatProductLabel(
                    products.find((p) => p.id === line.product_id) || {
                      id: "",
                      name: "—",
                      model_no: null,
                      default_supplier_id: null,
                    }
                  )
                : formatPackageLabel(
                    packages.find((p) => p.id === line.package_id) || {
                      id: "",
                      name: "—",
                      package_code: null,
                      default_supplier_id: null,
                    }
                  ));
            return (
              <li key={line.local_id} className="rounded border border-gray-100 p-3">
                <div className="font-medium text-gray-900">
                  [{line.line_type}] {name}
                </div>
                <div className="mt-1 text-gray-600">数量: {line.quantity}</div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          単価の決定は発注工程で行います。
        </p>
      </section>

      <div className="sticky bottom-0 flex justify-between gap-3 bg-gray-100/95 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm disabled:opacity-50"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? "登録中..." : "登録する"}
        </button>
      </div>
    </div>
  );
}
