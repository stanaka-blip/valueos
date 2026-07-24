"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useState,
} from "react";

import {
  DELIVERY_DESTINATION_TYPES,
  DealerOrderCaseForm,
  DealerOrderCaseFormErrors,
  DealerOrderProductForm,
  INITIAL_PART_LINE,
  ORDER_FORM_STEPS,
  OrderFormStepId,
  REQUIRED_CASE_FORM_FIELDS,
  RequiredCaseFormField,
} from "./types";
import Step2ProductForm from "./Step2ProductForm";

const DUMMY_DEALER_NAME = "株式会社バリューサンプル販売店";

const FIELD_LABELS: Record<RequiredCaseFormField, string> = {
  dealer_contact: "販売店担当者",
  customer_name: "顧客名",
  customer_phone: "電話番号",
  site_address: "設置先住所",
  desired_delivery_date: "希望納品日",
  construction_date: "工事予定日",
  delivery_type: "納品先区分",
  delivery_address: "納品先住所",
  receiver_name: "荷受け担当者",
  receiver_phone: "荷受け電話番号",
};

const INITIAL_FORM: DealerOrderCaseForm = {
  dealer_name: DUMMY_DEALER_NAME,
  dealer_contact: "",
  customer_name: "",
  customer_name_kana: "",
  customer_phone: "",
  postal_code: "",
  site_address: "",
  desired_delivery_date: "",
  construction_date: "",
  contractor_name: "",
  contractor_contact: "",
  contractor_phone: "",
  delivery_type: "",
  delivery_name: "",
  delivery_postal_code: "",
  delivery_address: "",
  receiver_name: "",
  receiver_phone: "",
  receiving_hours: "",
  delivery_notes: "",
  case_memo: "",
};

const INITIAL_PRODUCT_FORM: DealerOrderProductForm = {
  order_category: "",
  manufacturer_id: "",
  series_id: "",
  package_id: "",
  quantity: "1",
  product_memo: "",
  part_lines: [INITIAL_PART_LINE],
};

export default function DealerNewOrderPage() {
  const [currentStep, setCurrentStep] = useState<OrderFormStepId>(1);
  const [form, setForm] = useState<DealerOrderCaseForm>(INITIAL_FORM);
  const [errors, setErrors] = useState<DealerOrderCaseFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [productForm, setProductForm] =
    useState<DealerOrderProductForm>(INITIAL_PRODUCT_FORM);

  const isSameAsSiteAddress = form.delivery_type === "設置先住所と同じ";

  const dateWarning =
    form.desired_delivery_date &&
    form.construction_date &&
    form.desired_delivery_date > form.construction_date
      ? "希望納品日が工事予定日より後になっています。日付をご確認ください。"
      : null;

  function clearFieldErrors(fields: Array<keyof DealerOrderCaseForm>) {
    if (!submitted) {
      return;
    }

    setErrors((current) => {
      let changed = false;
      const next = { ...current };

      for (const field of fields) {
        if (next[field]) {
          delete next[field];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }

  function handleChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;
    const fieldName = name as keyof DealerOrderCaseForm;

    if (fieldName === "delivery_type") {
      const nextType = value as DealerOrderCaseForm["delivery_type"];

      if (nextType === "設置先住所と同じ") {
        setForm((current) => ({
          ...current,
          delivery_type: nextType,
          delivery_address: current.site_address,
        }));
        clearFieldErrors(["delivery_type", "delivery_address"]);
      } else {
        setForm((current) => ({
          ...current,
          delivery_type: nextType,
        }));
        clearFieldErrors(["delivery_type"]);
      }

      return;
    }

    if (fieldName === "site_address") {
      setForm((current) => {
        const next: DealerOrderCaseForm = {
          ...current,
          site_address: value,
        };

        if (current.delivery_type === "設置先住所と同じ") {
          next.delivery_address = value;
        }

        return next;
      });

      if (form.delivery_type === "設置先住所と同じ") {
        clearFieldErrors(["site_address", "delivery_address"]);
      } else {
        clearFieldErrors(["site_address"]);
      }

      return;
    }

    setForm((current) => ({
      ...current,
      [fieldName]: value,
    }));
    clearFieldErrors([fieldName]);
  }

  function validateForm(currentForm: DealerOrderCaseForm): DealerOrderCaseFormErrors {
    const nextErrors: DealerOrderCaseFormErrors = {};

    for (const field of REQUIRED_CASE_FORM_FIELDS) {
      const value = currentForm[field].trim();

      if (!value) {
        nextErrors[field] = `${FIELD_LABELS[field]}は必須です`;
      }
    }

    return nextErrors;
  }

  function handleStep1Next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    const nextErrors = validateForm(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setCurrentStep(2);
  }

  function handleBackToStep1() {
    setCurrentStep(1);
  }

  function handleDraftSave() {
    // UI only for now
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <h1 className="text-2xl font-bold text-gray-900">新規発注</h1>
        <p className="mt-1 text-sm text-gray-500">
          {currentStep === 1
            ? "案件情報を入力してください"
            : "商品情報を入力してください"}
        </p>
      </header>

      <main className="space-y-6 p-4 md:p-8">
        <StepIndicator currentStep={currentStep} />

        {currentStep === 1 ? (
        <form onSubmit={handleStep1Next} className="space-y-6" noValidate>
          {hasErrors ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              必須項目に未入力があります。入力内容をご確認ください。
            </div>
          ) : null}

          <SectionCard title="販売店情報">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="販売店名">
                <input
                  type="text"
                  name="dealer_name"
                  value={form.dealer_name}
                  readOnly
                  className={`${inputClassName} bg-gray-100 text-gray-600`}
                />
              </Field>

              <Field
                label="販売店担当者"
                required
                error={errors.dealer_contact}
              >
                <input
                  type="text"
                  name="dealer_contact"
                  value={form.dealer_contact}
                  onChange={handleChange}
                  className={inputClassName}
                  aria-invalid={Boolean(errors.dealer_contact)}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="顧客情報">
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="顧客名"
                required
                error={errors.customer_name}
              >
                <input
                  type="text"
                  name="customer_name"
                  value={form.customer_name}
                  onChange={handleChange}
                  className={inputClassName}
                  aria-invalid={Boolean(errors.customer_name)}
                />
              </Field>

              <Field label="顧客名カナ">
                <input
                  type="text"
                  name="customer_name_kana"
                  value={form.customer_name_kana}
                  onChange={handleChange}
                  className={inputClassName}
                />
              </Field>

              <Field
                label="電話番号"
                required
                error={errors.customer_phone}
              >
                <input
                  type="tel"
                  name="customer_phone"
                  value={form.customer_phone}
                  onChange={handleChange}
                  className={inputClassName}
                  aria-invalid={Boolean(errors.customer_phone)}
                />
              </Field>

              <Field label="郵便番号" description="例：123-4567">
                <input
                  type="text"
                  name="postal_code"
                  value={form.postal_code}
                  onChange={handleChange}
                  placeholder="123-4567"
                  className={inputClassName}
                />
              </Field>

              <div className="md:col-span-2">
                <Field
                  label="設置先住所"
                  required
                  error={errors.site_address}
                >
                  <input
                    type="text"
                    name="site_address"
                    value={form.site_address}
                    onChange={handleChange}
                    className={inputClassName}
                    aria-invalid={Boolean(errors.site_address)}
                  />
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="日程情報">
            {dateWarning ? (
              <div
                role="alert"
                className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
              >
                {dateWarning}
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="希望納品日"
                required
                error={errors.desired_delivery_date}
              >
                <input
                  type="date"
                  name="desired_delivery_date"
                  value={form.desired_delivery_date}
                  onChange={handleChange}
                  className={inputClassName}
                  aria-invalid={Boolean(errors.desired_delivery_date)}
                />
              </Field>

              <Field
                label="工事予定日"
                required
                error={errors.construction_date}
              >
                <input
                  type="date"
                  name="construction_date"
                  value={form.construction_date}
                  onChange={handleChange}
                  className={inputClassName}
                  aria-invalid={Boolean(errors.construction_date)}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="施工店情報">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="施工店名">
                <input
                  type="text"
                  name="contractor_name"
                  value={form.contractor_name}
                  onChange={handleChange}
                  className={inputClassName}
                />
              </Field>

              <Field label="施工店担当者">
                <input
                  type="text"
                  name="contractor_contact"
                  value={form.contractor_contact}
                  onChange={handleChange}
                  className={inputClassName}
                />
              </Field>

              <Field label="施工店電話番号">
                <input
                  type="tel"
                  name="contractor_phone"
                  value={form.contractor_phone}
                  onChange={handleChange}
                  className={inputClassName}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="納品情報">
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="納品先区分"
                required
                error={errors.delivery_type}
              >
                <select
                  name="delivery_type"
                  value={form.delivery_type}
                  onChange={handleChange}
                  className={inputClassName}
                  aria-invalid={Boolean(errors.delivery_type)}
                >
                  <option value="">選択してください</option>
                  {DELIVERY_DESTINATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="納品先名称">
                <input
                  type="text"
                  name="delivery_name"
                  value={form.delivery_name}
                  onChange={handleChange}
                  className={inputClassName}
                />
              </Field>

              <Field label="納品先郵便番号">
                <input
                  type="text"
                  name="delivery_postal_code"
                  value={form.delivery_postal_code}
                  onChange={handleChange}
                  placeholder="123-4567"
                  className={inputClassName}
                />
              </Field>

              <Field
                label="荷受け担当者"
                required
                error={errors.receiver_name}
              >
                <input
                  type="text"
                  name="receiver_name"
                  value={form.receiver_name}
                  onChange={handleChange}
                  className={inputClassName}
                  aria-invalid={Boolean(errors.receiver_name)}
                />
              </Field>

              <div className="md:col-span-2">
                <Field
                  label="納品先住所"
                  required
                  error={errors.delivery_address}
                  description={
                    isSameAsSiteAddress
                      ? "設置先住所と同じを選択中のため、設置先住所が自動反映されます。"
                      : undefined
                  }
                >
                  <input
                    type="text"
                    name="delivery_address"
                    value={form.delivery_address}
                    onChange={handleChange}
                    readOnly={isSameAsSiteAddress}
                    className={
                      isSameAsSiteAddress
                        ? `${inputClassName} bg-gray-100 text-gray-600`
                        : inputClassName
                    }
                    aria-invalid={Boolean(errors.delivery_address)}
                  />
                </Field>
              </div>

              <Field
                label="荷受け電話番号"
                required
                error={errors.receiver_phone}
              >
                <input
                  type="tel"
                  name="receiver_phone"
                  value={form.receiver_phone}
                  onChange={handleChange}
                  className={inputClassName}
                  aria-invalid={Boolean(errors.receiver_phone)}
                />
              </Field>

              <Field label="荷受け可能時間">
                <input
                  type="text"
                  name="receiving_hours"
                  value={form.receiving_hours}
                  onChange={handleChange}
                  placeholder="例：平日 9:00〜17:00"
                  className={inputClassName}
                />
              </Field>

              <div className="md:col-span-2">
                <Field label="納品時の注意事項">
                  <textarea
                    name="delivery_notes"
                    value={form.delivery_notes}
                    onChange={handleChange}
                    rows={3}
                    className={inputClassName}
                  />
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="備考">
            <Field label="案件備考">
              <textarea
                name="case_memo"
                value={form.case_memo}
                onChange={handleChange}
                rows={4}
                className={inputClassName}
              />
            </Field>
          </SectionCard>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleDraftSave}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              下書き保存
            </button>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700"
            >
              次へ
            </button>
          </div>
        </form>
        ) : (
        <Step2ProductForm
          productForm={productForm}
          onProductFormChange={setProductForm}
          onBack={handleBackToStep1}
        />
        )}
      </main>
    </>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <section className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm md:p-5">
      <ol className="flex min-w-max items-center gap-2 md:min-w-0 md:gap-3">
        {ORDER_FORM_STEPS.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;

          return (
            <li key={step.id} className="flex items-center gap-2 md:gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : isCompleted
                        ? "bg-gray-700 text-white"
                        : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step.id}
                </span>
                <span
                  className={`whitespace-nowrap text-sm ${
                    isActive
                      ? "font-bold text-gray-900"
                      : "font-medium text-gray-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {index < ORDER_FORM_STEPS.length - 1 ? (
                <span
                  className="hidden h-px w-6 bg-gray-300 sm:block md:w-10"
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
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

function Field({
  label,
  required = false,
  description,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-700">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>

      {description ? (
        <span className="mt-1 block text-xs text-gray-500">
          {description}
        </span>
      ) : null}

      <div className="mt-2">{children}</div>

      {error ? (
        <span className="mt-1.5 block text-sm font-medium text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
