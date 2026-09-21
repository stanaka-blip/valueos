"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { isProductActiveFlag } from "@/app/products/productListQuery";
import {
  fetchActiveContractors,
  fetchActiveDealers,
  fetchActivePackages,
  fetchActiveProducts,
  fetchActiveSuppliers,
  type ContractorOption,
  type DealerOption,
  type PackageOption,
  type ProductOption,
  type SupplierOption,
} from "./masters";
import Step1CaseForm from "./Step1CaseForm";
import Step2LinesForm, {
  buildPackageLinePatch,
  buildProductLinePatch,
  buildSupplierChangePatch,
} from "./Step2LinesForm";
import Step3SettlementForm from "./Step3SettlementForm";
import Step4ConfirmForm from "./Step4ConfirmForm";
import StepChrome from "./StepChrome";
import {
  type PendingAttachmentDraft,
  uploadPendingDrafts,
} from "@/lib/caseAttachments/clientUpload";
import { createIdempotencyKey, submitCaseRegistration } from "./submitCaseRegistration";
import {
  deleteCaseRegistrationDraft,
  fetchCaseRegistrationDraft,
  fetchCaseRegistrationDrafts,
  saveCaseRegistrationDraft,
  type DraftListItem,
} from "./submitCaseRegistrationDraft";
import { resolveLinePrices } from "./linePriceResolve";
import {
  createEmptyLine,
  createInitialCaseForm,
  createInitialSettlementForm,
  registrationFingerprint,
  type CaseFormErrors,
  type CaseFormState,
  type CaseRegistrationStepId,
  type LineDraft,
  type LineErrors,
  type SettlementErrors,
  type SettlementFormState,
} from "./types";
import {
  buildGatewayBody,
  hasSettlementErrors,
  validateStep1,
  validateStep2,
  validateStep3,
} from "./validation";

export default function CaseRegistrationWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<CaseRegistrationStepId>(1);
  const [caseForm, setCaseForm] = useState<CaseFormState>(createInitialCaseForm);
  const [lines, setLines] = useState<LineDraft[]>([createEmptyLine()]);
  const [settlement, setSettlement] = useState<SettlementFormState>(
    createInitialSettlementForm
  );

  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [masterError, setMasterError] = useState<string | null>(null);

  const [step1Errors, setStep1Errors] = useState<CaseFormErrors>({});
  const [step2FormError, setStep2FormError] = useState<string | null>(null);
  const [step2LineErrors, setStep2LineErrors] = useState<Record<string, LineErrors>>({});
  const [step3Errors, setStep3Errors] = useState<SettlementErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attachmentDrafts, setAttachmentDrafts] = useState<
    PendingAttachmentDraft[]
  >([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftList, setDraftList] = useState<DraftListItem[]>([]);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [priceLoadingIds, setPriceLoadingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [inactiveProductIds, setInactiveProductIds] = useState<Set<string>>(
    () => new Set()
  );

  const idempotencyKeyRef = useRef<string | null>(null);
  const fingerprintForKeyRef = useRef<string>("");
  const linesRef = useRef(lines);
  linesRef.current = lines;

  function goToCaseDocuments(caseId: string) {
    router.replace(`/cases/${caseId}?tab=documents`);
    router.refresh();
  }

  async function runAttachmentUploads(
    caseId: string,
    drafts: PendingAttachmentDraft[]
  ) {
    if (drafts.length === 0) {
      goToCaseDocuments(caseId);
      return;
    }
    setUploadingAttachments(true);
    try {
      const next = await uploadPendingDrafts({
        caseId,
        drafts,
        onUpdate: setAttachmentDrafts,
      });
      const failed = next.filter((d) => d.status === "error");
      if (failed.length === 0) {
        goToCaseDocuments(caseId);
        return;
      }
      setSubmitError(
        `${failed.length}件の添付アップロードに失敗しました。再送するか、案件詳細の資料タブから追加してください。`
      );
    } finally {
      setUploadingAttachments(false);
    }
  }

  const refreshDraftList = useCallback(async () => {
    const listed = await fetchCaseRegistrationDrafts();
    if (listed.ok) setDraftList(listed.drafts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [d, c, p, pkg, s] = await Promise.all([
        fetchActiveDealers(),
        fetchActiveContractors(),
        fetchActiveProducts(),
        fetchActivePackages(),
        fetchActiveSuppliers(),
      ]);
      if (cancelled) return;
      if (
        d.errorMessage ||
        c.errorMessage ||
        p.errorMessage ||
        pkg.errorMessage ||
        s.errorMessage
      ) {
        setMasterError("マスタの取得に失敗しました");
      }
      setDealers(d.data);
      setContractors(c.data);
      setProducts(p.data);
      setPackages(pkg.data);
      setSuppliers(s.data);
      await refreshDraftList();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshDraftList]);

  useEffect(() => {
    const resumeId = searchParams.get("draft");
    if (!resumeId) return;
    let cancelled = false;
    (async () => {
      const loaded = await fetchCaseRegistrationDraft(resumeId);
      if (cancelled || !loaded.ok || !loaded.payload) return;
      setDraftId(loaded.draftId || resumeId);
      setStep(loaded.payload.step);
      setCaseForm(loaded.payload.caseForm);
      setLines(loaded.payload.lines);
      setSettlement(loaded.payload.settlement);
      setDraftNotice("下書きを再開しました");

      // inactive 商品を表示維持するため、候補に無い id を追加取得
      const missingIds = loaded.payload.lines
        .filter((l) => l.line_type === "PRODUCT" && l.product_id)
        .map((l) => l.product_id)
        .filter(Boolean);
      if (missingIds.length) {
        const { data } = await supabase
          .from("products")
          .select(
            `
            id, name, model_no, is_active, default_supplier_id, category,
            manufacturers ( name ),
            series:series_id ( name )
          `
          )
          .in("id", missingIds);
        const inactive = new Set<string>();
        const extras: ProductOption[] = [];
        for (const row of data || []) {
          const id = String(row.id);
          if (!isProductActiveFlag(row.is_active)) inactive.add(id);
          const makers = row.manufacturers as
            | { name: string | null }
            | { name: string | null }[]
            | null;
          const maker = Array.isArray(makers) ? makers[0] : makers;
          const series = row.series as
            | { name: string | null }
            | { name: string | null }[]
            | null;
          const seriesRow = Array.isArray(series) ? series[0] : series;
          extras.push({
            id,
            name: (row.name as string | null) || "名称未設定",
            model_no: (row.model_no as string | null) || null,
            default_supplier_id:
              (row.default_supplier_id as string | null) || null,
            manufacturer_name: maker?.name || null,
            category: (row.category as string | null) || null,
            series_name: seriesRow?.name || null,
          });
        }
        setInactiveProductIds(inactive);
        if (extras.length) {
          setProducts((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [...prev, ...extras.filter((e) => !ids.has(e.id))];
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  function ensureIdempotencyKey(): string {
    const fp = registrationFingerprint(caseForm, lines, settlement);
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

  async function refreshPricesForLine(
    localId: string,
    line: LineDraft,
    options?: { keepManualPurchase?: boolean }
  ) {
    setPriceLoadingIds((prev) => new Set(prev).add(localId));
    try {
      const prices = await resolveLinePrices({
        client: supabase,
        lineType: line.line_type,
        productId: line.product_id,
        packageId: line.package_id,
        supplierId: line.supplier_id,
        dealerId: caseForm.dealer_id,
        asOfDate: caseForm.order_received_date,
        keepManualPurchase: options?.keepManualPurchase === true,
        currentPurchasePrice: line.purchase_price,
      });
      setLines((prev) =>
        prev.map((l) => (l.local_id === localId ? { ...l, ...prices } : l))
      );
    } finally {
      setPriceLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(localId);
        return next;
      });
    }
  }

  function handleProductSelected(localId: string, productId: string) {
    const patch = buildProductLinePatch(productId, products, packages);
    handleChangeLine(localId, patch);
    const nextLine: LineDraft = {
      ...(linesRef.current.find((l) => l.local_id === localId) || createEmptyLine()),
      ...patch,
      local_id: localId,
      line_type: "PRODUCT",
    };
    void refreshPricesForLine(localId, nextLine, { keepManualPurchase: false });
  }

  function handlePackageSelected(localId: string, packageId: string) {
    const patch = buildPackageLinePatch(packageId, products, packages);
    handleChangeLine(localId, patch);
    const nextLine: LineDraft = {
      ...(linesRef.current.find((l) => l.local_id === localId) || createEmptyLine()),
      ...patch,
      local_id: localId,
      line_type: "PACKAGE",
    };
    void refreshPricesForLine(localId, nextLine, { keepManualPurchase: false });
  }

  function handleSupplierSelected(localId: string, supplierId: string) {
    const current =
      linesRef.current.find((l) => l.local_id === localId) || createEmptyLine();
    const patch = buildSupplierChangePatch(supplierId, current);
    handleChangeLine(localId, patch);
    const nextLine: LineDraft = { ...current, ...patch, supplier_id: supplierId };
    void refreshPricesForLine(localId, nextLine, {
      keepManualPurchase: current.purchase_price_is_manual,
    });
  }

  function goStep2() {
    const errors = validateStep1(caseForm);
    setStep1Errors(errors);
    if (Object.keys(errors).length) return;
    setStep(2);
  }

  function goStep3() {
    const result = validateStep2(lines, { enforceDefaultSupplier: true });
    setStep2FormError(result.formError);
    setStep2LineErrors(result.lineErrors);
    if (!result.ok) return;
    setStep(3);
  }

  function goStep4() {
    const errors = validateStep3(settlement);
    setStep3Errors(errors);
    if (hasSettlementErrors(errors)) return;
    setStep(4);
  }

  function buildDraftPayload() {
    return {
      version: 1 as const,
      step,
      caseForm,
      lines,
      settlement,
    };
  }

  async function handleSaveDraft() {
    if (savingDraft || submitting || createdCaseId) return;
    setSavingDraft(true);
    setDraftError(null);
    setDraftNotice(null);
    try {
      const result = await saveCaseRegistrationDraft({
        draftId,
        payload: buildDraftPayload(),
      });
      if (!result.ok || !result.draftId) {
        setDraftError(result.error_message || "下書きを保存できませんでした");
        return;
      }
      setDraftId(result.draftId);
      setDraftNotice("下書きを保存しました");
      await refreshDraftList();
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleDeleteDraft(id: string) {
    if (!window.confirm("この下書きを削除しますか？")) return;
    const result = await deleteCaseRegistrationDraft(id);
    if (!result.ok) {
      setDraftError(result.error_message || "削除に失敗しました");
      return;
    }
    if (draftId === id) {
      setDraftId(null);
      setDraftNotice("下書きを削除しました（入力内容は画面に残っています）");
    }
    await refreshDraftList();
  }

  async function handleSubmit() {
    if (submitting || uploadingAttachments || createdCaseId) return;
    const e1 = validateStep1(caseForm);
    const e2 = validateStep2(lines, { enforceDefaultSupplier: true });
    const e3 = validateStep3(settlement);
    if (
      Object.keys(e1).length ||
      !e2.ok ||
      hasSettlementErrors(e3) ||
      !settlement.settlement_type
    ) {
      setSubmitError("入力内容を確認してください");
      return;
    }

    // inactive 商品を含む下書きは確定不可
    for (const line of lines) {
      if (
        line.line_type === "PRODUCT" &&
        line.product_id &&
        inactiveProductIds.has(line.product_id)
      ) {
        setSubmitError(
          "利用停止中の商品が含まれています。差し替えてから登録してください。"
        );
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const key = ensureIdempotencyKey();
      const body = buildGatewayBody(caseForm, lines, {
        settlement_type: settlement.settlement_type,
        finance_company: settlement.finance_company,
        approval_number: settlement.approval_number,
        card_brand: settlement.card_brand,
      });
      const result = await submitCaseRegistration({ body, idempotencyKey: key });
      if (!result.ok) {
        setSubmitError(result.error_message);
        setSubmitting(false);
        return;
      }
      // 正式登録成功後に下書き削除（失敗しても案件は残す）
      if (draftId) {
        await deleteCaseRegistrationDraft(draftId);
        setDraftId(null);
      }
      setCreatedCaseId(result.case_id);
      await runAttachmentUploads(result.case_id, attachmentDrafts);
    } catch {
      setSubmitError("登録を完了できませんでした");
      setSubmitting(false);
    }
  }

  async function handleRetryFailedUploads() {
    if (!createdCaseId || uploadingAttachments) return;
    setSubmitError(null);
    const reset = attachmentDrafts.map((d) =>
      d.status === "error" || d.status === "queued"
        ? { ...d, status: "queued" as const, progress: 0, errorMessage: undefined }
        : d
    );
    setAttachmentDrafts(reset);
    await runAttachmentUploads(createdCaseId, reset);
  }

  const productsForSelect = products.map((p) =>
    inactiveProductIds.has(p.id)
      ? {
          ...p,
          name: `${p.name}（利用停止）`,
        }
      : p
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-2 text-xl font-bold text-gray-900">案件登録</h1>
      <p className="mb-4 text-sm text-gray-600">
        社内向け4ステップ登録です。商品選択時に標準仕入先と仕入単価を表示し、必要なら変更できます。途中内容は下書き保存できます。
      </p>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">下書き</h2>
          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={savingDraft || submitting || Boolean(createdCaseId)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {savingDraft ? "保存中…" : "下書き保存"}
          </button>
        </div>
        {draftNotice ? (
          <p className="mb-2 text-sm text-emerald-700">{draftNotice}</p>
        ) : null}
        {draftError ? (
          <p className="mb-2 text-sm text-red-600">{draftError}</p>
        ) : null}
        {draftList.length === 0 ? (
          <p className="text-sm text-gray-500">保存済みの下書きはありません。</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {draftList.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 px-3 py-2"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {d.customer_name_preview || "（顧客名未入力）"}
                  </div>
                  <div className="text-xs text-gray-500">
                    STEP{d.current_step}まで · 更新{" "}
                    {d.updated_at
                      ? new Date(d.updated_at).toLocaleString("ja-JP")
                      : "—"}
                    {draftId === d.id ? " · 編集中" : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    href={`/cases/new?draft=${d.id}`}
                  >
                    再開
                  </a>
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                    onClick={() => void handleDeleteDraft(d.id)}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
          contractors={contractors}
          errors={step1Errors}
          onChange={handleCaseFormChange}
          onNext={goStep2}
        />
      ) : null}

      {step === 2 ? (
        <Step2LinesForm
          lines={lines}
          products={productsForSelect}
          packages={packages}
          suppliers={suppliers}
          formError={step2FormError}
          lineErrors={step2LineErrors}
          priceLoadingIds={priceLoadingIds}
          onChangeLine={handleChangeLine}
          onProductSelected={handleProductSelected}
          onPackageSelected={handlePackageSelected}
          onSupplierSelected={handleSupplierSelected}
          onAddLine={() => setLines((prev) => [...prev, createEmptyLine()])}
          onRemoveLine={(id) =>
            setLines((prev) =>
              prev.length <= 1 ? prev : prev.filter((l) => l.local_id !== id)
            )
          }
          onBack={() => setStep(1)}
          onNext={goStep3}
        />
      ) : null}

      {step === 3 ? (
        <Step3SettlementForm
          settlement={settlement}
          errors={step3Errors}
          onChange={setSettlement}
          onBack={() => setStep(2)}
          onNext={goStep4}
        />
      ) : null}

      {step === 4 && settlement.settlement_type ? (
        <Step4ConfirmForm
          caseForm={caseForm}
          lines={lines}
          settlement={{
            ...settlement,
            settlement_type: settlement.settlement_type,
          }}
          dealers={dealers}
          suppliers={suppliers}
          products={products}
          packages={packages}
          attachmentDrafts={attachmentDrafts}
          onAttachmentDraftsChange={setAttachmentDrafts}
          submitting={submitting}
          uploadingAttachments={uploadingAttachments}
          submitError={submitError}
          createdCaseId={createdCaseId}
          onBack={() => setStep(3)}
          onSubmit={handleSubmit}
          onRetryFailedUploads={() => void handleRetryFailedUploads()}
          onContinueToCase={() => {
            if (createdCaseId) goToCaseDocuments(createdCaseId);
          }}
          onSaveDraft={() => void handleSaveDraft()}
          savingDraft={savingDraft}
        />
      ) : null}
    </div>
  );
}
