"use client";

import { SETTLEMENT_TYPES, type SettlementType } from "./types";

type Props = {
  settlementType: SettlementType | "";
  error: string | null;
  onChange: (value: SettlementType | "") => void;
  onBack: () => void;
  onNext: () => void;
};

export default function Step3SettlementForm({
  settlementType,
  error,
  onChange,
  onBack,
  onNext,
}: Props) {
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
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
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
              checked={settlementType === type}
              onChange={() => onChange(type)}
            />
            {type}
          </label>
        ))}
      </fieldset>

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
