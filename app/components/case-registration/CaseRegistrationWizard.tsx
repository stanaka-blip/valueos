"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchActiveDealers,
  fetchActivePackages,
  fetchActiveProducts,
  fetchActiveSuppliers,
  type DealerOption,
  type PackageOption,
  type ProductOption,
  type SupplierOption,
} from "./masters";
import { refreshLinePrices } from "./pricePreview";
import Step1CaseForm from "./Step1CaseForm";
import Step2LinesForm from "./Step2LinesForm";
import Step3SettlementForm from "./Step3SettlementForm";
import Step4ConfirmForm from "./Step4ConfirmForm";
import StepChrome from "./StepChrome";
import { createIdempotencyKey, submitCaseRegistration } from "./submitCaseRegistration";
import {
  createEmptyLine,
  createInitialCaseForm,
  registrationFingerprint,
  type CaseFormErrors,
  type CaseFormState,
  type CaseRegistrationStepId,
  type LineDraft,
  type LineErrors,
  type SettlementType,
} from "./types";
import {
  buildGatewayBody,
  validateStep1,
  validateStep2,
  validateStep3,
} from "./validation";

export default function CaseRegistrationWizard() {
  const router = useRouter();
  const [step, setStep] = useState<CaseRegistrationStepId>(1);
  const [caseForm, setCaseForm] = useState<CaseFormState>(createInitialCaseForm);
  const [lines, setLines] = useState<LineDraft[]>([createEmptyLine()]);
  const [settlementType, setSettlementType] = useState<SettlementType | "">("");

  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [masterError, setMasterError] = useState<string | null>(null);

  const [step1Errors, setStep1Errors] = useState<CaseFormErrors>({});
  const [step2FormError, setStep2FormError] = useState<string | null>(null);
  const [step2LineErrors, setStep2LineErrors] = useState<Record<string, LineErrors>>({});
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const idempotencyKeyRef = useRef<string | null>(null);
  const fingerprintForKeyRef = useRef<string>("");
  const priceSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [d, p, pkg, s] = await Promise.all([
        fetchActiveDealers(),
        fetchActiveProducts(),
        fetchActivePackages(),
        fetchActiveSuppliers(),
      ]);
      if (cancelled) return;
      if (d.errorMessage || p.errorMessage || pkg.errorMessage || s.errorMessage) {
        setMasterError("マスタの取得に失敗しました");
      }
      setDealers(d.data);
      setProducts(p.data);
      setPackages(pkg.data);
      setSuppliers(s.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 販売店変更時: 未設定の仕入先へ default_supplier_id を反映
  useEffect(() => {
    const dealer = dealers.find((d) => d.id === caseForm.dealer_id);
    const def = dealer?.default_supplier_id || "";
    if (!def) return;
    setLines((prev) =>
      prev.map((line) => (line.supplier_id ? line : { ...line, supplier_id: def }))
    );
  }, [caseForm.dealer_id, dealers]);

  // 価格再取得（販売店・受注日・対象・数量・仕入先変更時）
  useEffect(() => {
    const seq = ++priceSeqRef.current;
    const dealerId = caseForm.dealer_id;
    const asOf = caseForm.order_received_date;
    const snapshot = lines;

    setLines((prev) =>
      prev.map((l) => ({ ...l, price_loading: true, price_error: null }))
    );

    (async () => {
      const nextLines = await Promise.all(
        snapshot.map((line) =>
          refreshLinePrices({
            line,
            dealerId,
            asOfDate: asOf,
          })
        )
      );
      if (seq !== priceSeqRef.current) return;
      setLines((prev) => {
        const byId = new Map(nextLines.map((l) => [l.local_id, l]));
        return prev.map((l) => {
          const priced = byId.get(l.local_id);
          if (!priced) return l;
          return {
            ...l,
            sales_unit_price: priced.sales_unit_price,
            purchase_unit_price: priced.purchase_unit_price,
            sales_found: priced.sales_found,
            purchase_found: priced.purchase_found,
            price_error: priced.price_error,
            price_loading: priced.price_loading,
          };
        });
      });
    })();
    // lines の構造キーのみ依存（価格フィールドは含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    caseForm.dealer_id,
    caseForm.order_received_date,
    lines
      .map((l) =>
        [l.local_id, l.line_type, l.product_id, l.package_id, l.supplier_id, l.quantity].join(":")
      )
      .join("|"),
  ]);

  function ensureIdempotencyKey(): string {
    const fp = registrationFingerprint(caseForm, lines, settlementType);
    if (!idempotencyKeyRef.current || fingerprintForKeyRef.current !== fp) {
      idempotencyKeyRef.current = createIdempotencyKey();
      fingerprintForKeyRef.current = fp;
    }
    return idempotencyKeyRef.current;
  }

  function handleCaseFormChange(next: CaseFormState) {
    setCaseForm(next);
  }

  function handleChangeLine(localId: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.local_id === localId ? { ...line, ...patch } : line))
    );
  }

  function goStep2() {
    const errors = validateStep1(caseForm);
    setStep1Errors(errors);
    if (Object.keys(errors).length) return;
    setStep(2);
  }

  function goStep3() {
    const result = validateStep2(lines);
    setStep2FormError(result.formError);
    setStep2LineErrors(result.lineErrors);
    if (!result.ok) return;
    setStep(3);
  }

  function goStep4() {
    const err = validateStep3(settlementType);
    setStep3Error(err);
    if (err) return;
    setStep(4);
  }

  async function handleSubmit() {
    if (submitting) return;
    const e1 = validateStep1(caseForm);
    const e2 = validateStep2(lines);
    const e3 = validateStep3(settlementType);
    if (Object.keys(e1).length || !e2.ok || e3 || !settlementType) {
      setSubmitError("入力内容を確認してください");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const key = ensureIdempotencyKey();
      const body = buildGatewayBody(caseForm, lines, settlementType);
      const result = await submitCaseRegistration({ body, idempotencyKey: key });
      if (!result.ok) {
        setSubmitError(result.error_message);
        setSubmitting(false);
        return;
      }
      // 成功後は submitting を解除せず二重送信を防ぐ
      router.replace(`/cases/${result.case_id}`);
      router.refresh();
    } catch {
      setSubmitError("登録を完了できませんでした");
      setSubmitting(false);
    }
  }

  const defaultSupplier =
    dealers.find((d) => d.id === caseForm.dealer_id)?.default_supplier_id || "";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-2 text-xl font-bold text-gray-900">案件登録</h1>
      <p className="mb-4 text-sm text-gray-600">
        社内向け4ステップ登録です。保存はサーバー経由のみ行います。
      </p>
      <StepChrome step={step} />
      {masterError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {masterError}
        </div>
      ) : null}

      {step === 1 ? (
        <Step1CaseForm
          caseForm={caseForm}
          dealers={dealers}
          errors={step1Errors}
          onChange={handleCaseFormChange}
          onNext={goStep2}
        />
      ) : null}

      {step === 2 ? (
        <Step2LinesForm
          lines={lines}
          products={products}
          packages={packages}
          suppliers={suppliers}
          formError={step2FormError}
          lineErrors={step2LineErrors}
          onChangeLine={handleChangeLine}
          onAddLine={() => setLines((prev) => [...prev, createEmptyLine(defaultSupplier)])}
          onRemoveLine={(id) =>
            setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.local_id !== id)))
          }
          onBack={() => setStep(1)}
          onNext={goStep3}
        />
      ) : null}

      {step === 3 ? (
        <Step3SettlementForm
          settlementType={settlementType}
          error={step3Error}
          onChange={setSettlementType}
          onBack={() => setStep(2)}
          onNext={goStep4}
        />
      ) : null}

      {step === 4 && settlementType ? (
        <Step4ConfirmForm
          caseForm={caseForm}
          lines={lines}
          settlementType={settlementType}
          dealers={dealers}
          products={products}
          packages={packages}
          suppliers={suppliers}
          submitting={submitting}
          submitError={submitError}
          onBack={() => setStep(3)}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}
