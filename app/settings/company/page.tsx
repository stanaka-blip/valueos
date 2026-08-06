"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useState,
} from "react";

import type { CompanySettingsDto } from "@/lib/companyInfo/companySettingsDto";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyInfo/types";

import {
  fetchCompanySettings,
  submitCompanySettings,
} from "./submitCompanySettings";

const emptyForm: CompanySettingsDto = {
  company_name: DEFAULT_COMPANY_NAME,
  postal_code: null,
  address: null,
  phone: null,
  fax: null,
  email: null,
  invoice_registration_number: null,
  bank_name: null,
  bank_branch: null,
  bank_account_type: null,
  bank_account_number: null,
  bank_account_holder: null,
};

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

function toInputValue(value: string | null): string {
  return value ?? "";
}

export default function CompanySettingsPage() {
  const [form, setForm] = useState<CompanySettingsDto>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      const result = await fetchCompanySettings();
      if (cancelled) return;

      if (!result.ok) {
        setLoadError(result.error_message);
        setLoading(false);
        return;
      }

      setForm(result.data);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");
    setFieldErrors({});

    if (!form.company_name.trim()) {
      setFieldErrors({ company_name: "会社名は必須です" });
      setSubmitError("入力内容が正しくありません");
      return;
    }

    setSaving(true);
    const result = await submitCompanySettings({
      company_name: form.company_name.trim(),
      postal_code: form.postal_code?.trim() || null,
      address: form.address?.trim() || null,
      phone: form.phone?.trim() || null,
      fax: form.fax?.trim() || null,
      email: form.email?.trim() || null,
      invoice_registration_number:
        form.invoice_registration_number?.trim() || null,
      bank_name: form.bank_name?.trim() || null,
      bank_branch: form.bank_branch?.trim() || null,
      bank_account_type: form.bank_account_type?.trim() || null,
      bank_account_number: form.bank_account_number?.trim() || null,
      bank_account_holder: form.bank_account_holder?.trim() || null,
    });
    setSaving(false);

    if (!result.ok) {
      if (result.field_errors) {
        setFieldErrors(result.field_errors);
      }
      setSubmitError(result.error_message);
      return;
    }

    setForm(result.data);
    setToastMessage("保存しました");
  }

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <h1 className="text-2xl font-bold text-gray-900">会社情報</h1>
        <p className="mt-1 text-sm text-gray-500">
          発注書・納品書・請求書に表示する発行元情報を管理します。未入力の項目は帳票に出しません。
        </p>
      </header>

      <main className="p-4 md:p-8">
        {loading ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            読み込み中...
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-3xl space-y-6 rounded-xl bg-white p-5 shadow-sm md:p-8"
          >
            {loadError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {loadError}
              </div>
            ) : null}

            {submitError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {submitError}
              </div>
            ) : null}

            <Section title="基本情報">
              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  label="会社名"
                  required
                  error={fieldErrors.company_name}
                  className="md:col-span-2"
                >
                  <input
                    name="company_name"
                    value={toInputValue(form.company_name)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
                <Field label="郵便番号" error={fieldErrors.postal_code}>
                  <input
                    name="postal_code"
                    value={toInputValue(form.postal_code)}
                    onChange={handleChange}
                    placeholder="例：100-0001"
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label="住所"
                  error={fieldErrors.address}
                  className="md:col-span-2"
                >
                  <input
                    name="address"
                    value={toInputValue(form.address)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
                <Field label="電話番号" error={fieldErrors.phone}>
                  <input
                    name="phone"
                    value={toInputValue(form.phone)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
                <Field label="FAX" error={fieldErrors.fax}>
                  <input
                    name="fax"
                    value={toInputValue(form.fax)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label="メールアドレス"
                  error={fieldErrors.email}
                  className="md:col-span-2"
                >
                  <input
                    type="email"
                    name="email"
                    value={toInputValue(form.email)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
              </div>
            </Section>

            <Section title="請求書情報">
              <Field
                label="適格請求書登録番号（インボイス番号）"
                error={fieldErrors.invoice_registration_number}
              >
                <input
                  name="invoice_registration_number"
                  value={toInputValue(form.invoice_registration_number)}
                  onChange={handleChange}
                  placeholder="例：T1234567890123"
                  disabled={saving}
                  className={inputClassName}
                />
              </Field>
            </Section>

            <Section title="振込先">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="銀行名" error={fieldErrors.bank_name}>
                  <input
                    name="bank_name"
                    value={toInputValue(form.bank_name)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
                <Field label="支店名" error={fieldErrors.bank_branch}>
                  <input
                    name="bank_branch"
                    value={toInputValue(form.bank_branch)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
                <Field label="口座種別" error={fieldErrors.bank_account_type}>
                  <select
                    name="bank_account_type"
                    value={toInputValue(form.bank_account_type)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  >
                    <option value="">未設定</option>
                    <option value="普通">普通</option>
                    <option value="当座">当座</option>
                  </select>
                </Field>
                <Field
                  label="口座番号"
                  error={fieldErrors.bank_account_number}
                >
                  <input
                    name="bank_account_number"
                    value={toInputValue(form.bank_account_number)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label="口座名義"
                  error={fieldErrors.bank_account_holder}
                  className="md:col-span-2"
                >
                  <input
                    name="bank_account_holder"
                    value={toInputValue(form.bank_account_holder)}
                    onChange={handleChange}
                    disabled={saving}
                    className={inputClassName}
                  />
                </Field>
              </div>
            </Section>

            <div className="flex justify-end border-t pt-6">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {saving ? "保存しています..." : "保存する"}
              </button>
            </div>
          </form>
        )}
      </main>

      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {toastMessage}
        </div>
      ) : null}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  required = false,
  error,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-bold text-gray-700">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </span>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </label>
  );
}
