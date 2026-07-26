"use client";

import { FormEvent, ReactNode, useState } from "react";

import {
  DEALER_ORDER_SETTLEMENT_TYPES,
  DealerOrderSettlementType,
} from "./types";

type Step3SettlementFormProps = {
  settlementType: DealerOrderSettlementType | "";
  onSettlementTypeChange: (value: DealerOrderSettlementType | "") => void;
  onBack: () => void;
  onNext: () => void;
};

export default function Step3SettlementForm({
  settlementType,
  onSettlementTypeChange,
  onBack,
  onNext,
}: Step3SettlementFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    if (!settlementType) {
      setError("決済区分は必須です");
      return;
    }

    setError("");
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <SectionCard title="決済区分">
        <p className="mb-5 text-sm text-gray-600">
          案件の決済区分を選択してください。決済区分は必須です。
        </p>

        {submitted && error ? (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <label className="block">
          <span className="text-sm font-bold text-gray-700">
            決済区分
            <span className="ml-1 text-red-600">*</span>
          </span>
          <select
            value={settlementType}
            onChange={(event) => {
              onSettlementTypeChange(
                event.target.value as DealerOrderSettlementType | ""
              );
              if (submitted) {
                setError(
                  event.target.value ? "" : "決済区分は必須です"
                );
              }
            }}
            className={`${inputClassName} mt-2`}
            aria-invalid={Boolean(submitted && error)}
            required
          >
            <option value="">選択してください</option>
            {DEALER_ORDER_SETTLEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          {submitted && error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : null}
        </label>
      </SectionCard>

      <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          戻る
        </button>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700"
        >
          確認へ
        </button>
      </div>
    </form>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

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
