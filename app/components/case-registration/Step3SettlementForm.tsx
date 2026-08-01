"use client";

import {
  SETTLEMENT_TYPES,
  type SettlementErrors,
  type SettlementFormState,
  type SettlementType,
} from "./types";

type Props = {
  settlement: SettlementFormState;
  errors: SettlementErrors;
  onChange: (next: SettlementFormState) => void;
  onBack: () => void;
  onNext: () => void;
};

export default function Step3SettlementForm({
  settlement,
  errors,
  onChange,
  onBack,
  onNext,
}: Props) {
  function selectType(type: SettlementType) {
    onChange({
      settlement_type: type,
      finance_company: type === "3社間決済" ? settlement.finance_company : "",
      approval_number: type === "3社間決済" ? settlement.approval_number : "",
      card_brand: type === "カード" ? settlement.card_brand : "",
    });
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
      <p className="text-sm text-gray-600">案件の決済区分を選択してください。</p>
      {errors.form ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errors.form}
        </div>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-800">
          決済区分 <span className="text-red-600">*</span>
        </legend>
        {SETTLEMENT_TYPES.map((type) => (
          <label
            key={type}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm"
          >
            <input
              type="radio"
              name="settlement_type"
              value={type}
              checked={settlement.settlement_type === type}
              onChange={() => selectType(type)}
            />
            {type}
          </label>
        ))}
      </fieldset>

      {settlement.settlement_type === "3社間決済" ? (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-600">3社間決済の詳細を入力してください。</p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-800">
              信販会社 <span className="text-red-600">*</span>
            </span>
            <input
              type="text"
              value={settlement.finance_company}
              onChange={(e) =>
                onChange({ ...settlement, finance_company: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              autoComplete="off"
            />
            {errors.finance_company ? (
              <span className="mt-1 block text-xs text-red-600">
                {errors.finance_company}
              </span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-800">
              承認番号 <span className="text-red-600">*</span>
            </span>
            <input
              type="text"
              value={settlement.approval_number}
              onChange={(e) =>
                onChange({ ...settlement, approval_number: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              autoComplete="off"
            />
            {errors.approval_number ? (
              <span className="mt-1 block text-xs text-red-600">
                {errors.approval_number}
              </span>
            ) : null}
          </label>
        </div>
      ) : null}

      {settlement.settlement_type === "カード" ? (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-600">カード決済の詳細を入力してください。</p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-800">
              カード会社名 <span className="text-red-600">*</span>
            </span>
            <input
              type="text"
              value={settlement.card_brand}
              onChange={(e) =>
                onChange({ ...settlement, card_brand: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              autoComplete="off"
            />
            {errors.card_brand ? (
              <span className="mt-1 block text-xs text-red-600">{errors.card_brand}</span>
            ) : null}
          </label>
        </div>
      ) : null}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm"
        >
          戻る
        </button>
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
