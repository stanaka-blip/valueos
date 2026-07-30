"use client";

import type { DealerOption } from "./masters";
import type { CaseFormErrors, CaseFormState } from "./types";

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

type Props = {
  caseForm: CaseFormState;
  dealers: DealerOption[];
  errors: CaseFormErrors;
  onChange: (next: CaseFormState) => void;
  onNext: () => void;
};

export default function Step1CaseForm({
  caseForm,
  dealers,
  errors,
  onChange,
  onNext,
}: Props) {
  function set<K extends keyof CaseFormState>(key: K, value: CaseFormState[K]) {
    onChange({ ...caseForm, [key]: value });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      noValidate
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-gray-700 md:col-span-2">
          販売店 <span className="text-red-600">*</span>
          <select
            className={inputClass}
            value={caseForm.dealer_id}
            onChange={(e) => set("dealer_id", e.target.value)}
            required
          >
            <option value="">選択してください</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {errors.dealer_id ? <p className="mt-1 text-sm text-red-600">{errors.dealer_id}</p> : null}
        </label>

        <label className="block text-sm font-medium text-gray-700">
          顧客名 <span className="text-red-600">*</span>
          <input
            className={inputClass}
            value={caseForm.customer_name}
            onChange={(e) => set("customer_name", e.target.value)}
            required
          />
          {errors.customer_name ? (
            <p className="mt-1 text-sm text-red-600">{errors.customer_name}</p>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-gray-700">
          電話番号
          <input
            className={inputClass}
            value={caseForm.customer_phone}
            onChange={(e) => set("customer_phone", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-gray-700 md:col-span-2">
          設置先住所 <span className="text-red-600">*</span>
          <input
            className={inputClass}
            value={caseForm.site_address}
            onChange={(e) => set("site_address", e.target.value)}
            required
          />
          {errors.site_address ? (
            <p className="mt-1 text-sm text-red-600">{errors.site_address}</p>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-gray-700">
          受注日（価格基準日） <span className="text-red-600">*</span>
          <input
            type="date"
            className={inputClass}
            value={caseForm.order_received_date}
            onChange={(e) => set("order_received_date", e.target.value)}
            required
          />
          {errors.order_received_date ? (
            <p className="mt-1 text-sm text-red-600">{errors.order_received_date}</p>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-gray-700">
          希望納品日
          <input
            type="date"
            className={inputClass}
            value={caseForm.desired_delivery_date}
            onChange={(e) => set("desired_delivery_date", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          工事希望日
          <input
            type="date"
            className={inputClass}
            value={caseForm.construction_desired_date}
            onChange={(e) => set("construction_desired_date", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          受注区分
          <input
            className={inputClass}
            value={caseForm.order_type}
            onChange={(e) => set("order_type", e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 md:col-span-2">
          <input
            type="checkbox"
            checked={caseForm.delivery_same_as_site}
            onChange={(e) => set("delivery_same_as_site", e.target.checked)}
          />
          納品先は設置先住所と同じ
        </label>

        {!caseForm.delivery_same_as_site ? (
          <label className="block text-sm font-medium text-gray-700 md:col-span-2">
            納品先住所 <span className="text-red-600">*</span>
            <input
              className={inputClass}
              value={caseForm.delivery_address}
              onChange={(e) => set("delivery_address", e.target.value)}
              required
            />
            {errors.delivery_address ? (
              <p className="mt-1 text-sm text-red-600">{errors.delivery_address}</p>
            ) : null}
          </label>
        ) : null}

        <label className="block text-sm font-medium text-gray-700">
          販売店担当者
          <input
            className={inputClass}
            value={caseForm.assigned_user}
            onChange={(e) => set("assigned_user", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          案件番号（空なら自動採番）
          <input
            className={inputClass}
            value={caseForm.case_no}
            onChange={(e) => set("case_no", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-gray-700 md:col-span-2">
          工事内容
          <textarea
            className={inputClass}
            rows={2}
            value={caseForm.construction_detail}
            onChange={(e) => set("construction_detail", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-gray-700 md:col-span-2">
          メモ
          <textarea
            className={inputClass}
            rows={2}
            value={caseForm.memo}
            onChange={(e) => set("memo", e.target.value)}
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          次へ
        </button>
      </div>
    </form>
  );
}
