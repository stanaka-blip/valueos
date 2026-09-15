"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import SearchableSelect from "@/app/components/masters/SearchableSelect";
import {
  buildPackageSearchOption,
  buildProductSearchOption,
} from "@/app/components/masters/searchableSelect";
import {
  fetchActivePackages,
  fetchActiveProducts,
  type PackageOption,
  type ProductOption,
} from "@/app/components/case-registration/masters";
import {
  createEmptyLine,
  type LineDraft,
  type LineErrors,
  type LineType,
} from "@/app/components/case-registration/types";
import { validateStep2 } from "@/app/components/case-registration/validation";
import {
  caseLineFingerprint,
  createIdempotencyKey,
  submitCaseLine,
} from "../../submitCaseLine";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

const LINE_LOCAL_ID = "case-detail-add-line";

export default function NewCaseProductPage() {
  const router = useRouter();
  const params = useParams();
  const caseId = params.id as string;

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [masterError, setMasterError] = useState<string | null>(null);

  const [lineType, setLineType] = useState<LineType>("PRODUCT");
  const [productId, setProductId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const [lineErrors, setLineErrors] = useState<LineErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const idempotencyKeyRef = useRef<string | null>(null);
  const fingerprintForKeyRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, pkg] = await Promise.all([
        fetchActiveProducts(),
        fetchActivePackages(),
      ]);
      if (cancelled) return;
      if (p.errorMessage || pkg.errorMessage) {
        setMasterError("マスタの取得に失敗しました");
      }
      setProducts(p.data);
      setPackages(pkg.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function currentInput() {
    return {
      line_type: lineType,
      product_id: productId,
      package_id: packageId,
      quantity,
    };
  }

  function ensureIdempotencyKey(): string {
    const fp = caseLineFingerprint(currentInput());
    if (!idempotencyKeyRef.current || fingerprintForKeyRef.current !== fp) {
      idempotencyKeyRef.current = createIdempotencyKey();
      fingerprintForKeyRef.current = fp;
    }
    return idempotencyKeyRef.current;
  }

  function toLineDraft(): LineDraft {
    const empty = createEmptyLine();
    return {
      ...empty,
      local_id: LINE_LOCAL_ID,
      line_type: lineType,
      product_id: lineType === "PRODUCT" ? productId : "",
      package_id: lineType === "PACKAGE" ? packageId : "",
      quantity,
      memo: "",
      display_name: "",
    };
  }

  function applyLineType(next: LineType) {
    setLineType(next);
    setProductId("");
    setPackageId("");
    setLineErrors({});
    setFormError(null);
    setSubmitError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const result = validateStep2([toLineDraft()]);
    setFormError(result.formError);
    setLineErrors(result.lineErrors[LINE_LOCAL_ID] || {});
    if (!result.ok) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const key = ensureIdempotencyKey();
      const submitResult = await submitCaseLine({
        caseId,
        input: currentInput(),
        idempotencyKey: key,
      });
      if (!submitResult.ok) {
        setSubmitError(submitResult.error_message);
        if (submitResult.field_errors) {
          setLineErrors({
            product_id: submitResult.field_errors.product_id,
            package_id: submitResult.field_errors.package_id,
            quantity: submitResult.field_errors.quantity,
            line_type: submitResult.field_errors.line_type,
          });
        }
        setSubmitting(false);
        return;
      }
      // 成功後は submitting を解除せず二重送信を防ぐ
      router.replace(`/cases/${caseId}?tab=products`);
      router.refresh();
    } catch {
      setSubmitError("明細を追加できませんでした");
      setSubmitting(false);
    }
  }

  const productOptions = useMemo(
    () =>
      products.map((p) =>
        buildProductSearchOption({
          id: p.id,
          name: p.name,
          model_no: p.model_no,
          manufacturer_name: p.manufacturer_name,
          category: p.category,
          series_name: p.series_name,
        })
      ),
    [products]
  );
  const packageOptions = useMemo(
    () =>
      packages.map((p) =>
        buildPackageSearchOption({
          id: p.id,
          name: p.name,
          package_code: p.package_code,
        })
      ),
    [packages]
  );


  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">案件明細追加</h1>
        <p className="text-sm text-gray-500">
          商品またはパッケージと数量を指定して追加します。価格はサーバー側で解決されます。
        </p>
      </header>

      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mx-auto max-w-2xl space-y-6 rounded-xl bg-white p-8 shadow-sm"
        >
          {masterError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {masterError}
            </div>
          ) : null}
          {formError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
          {submitError ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {submitError}
            </div>
          ) : null}

          <label className="block">
            <p className="mb-2 text-sm font-bold text-gray-700">種別</p>
            <select
              className={inputClass}
              value={lineType}
              onChange={(e) => applyLineType(e.target.value as LineType)}
              disabled={submitting}
            >
              <option value="PRODUCT">商品</option>
              <option value="PACKAGE">パッケージ</option>
            </select>
            {lineErrors.line_type ? (
              <p className="mt-1 text-xs text-red-600">{lineErrors.line_type}</p>
            ) : null}
          </label>

          {lineType === "PRODUCT" ? (
            <div>
              <p className="mb-2 text-sm font-bold text-gray-700">商品</p>
              <SearchableSelect
                options={productOptions}
                value={productId}
                onChange={(id) => {
                  setProductId(id);
                  setSubmitError(null);
                }}
                disabled={submitting}
                placeholder="型番・商品名で検索"
                unsetLabel="商品を検索して選択"
              />
              {lineErrors.product_id ? (
                <p className="mt-1 text-xs text-red-600">{lineErrors.product_id}</p>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm font-bold text-gray-700">パッケージ</p>
              <SearchableSelect
                options={packageOptions}
                value={packageId}
                onChange={(id) => {
                  setPackageId(id);
                  setSubmitError(null);
                }}
                disabled={submitting}
                placeholder="パッケージ名・コードで検索"
                unsetLabel="パッケージを検索して選択"
              />
              {lineErrors.package_id ? (
                <p className="mt-1 text-xs text-red-600">{lineErrors.package_id}</p>
              ) : null}
            </div>
          )}

          <label className="block">
            <p className="mb-2 text-sm font-bold text-gray-700">数量</p>
            <input
              type="text"
              inputMode="numeric"
              className={inputClass}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setSubmitError(null);
              }}
              disabled={submitting}
              autoComplete="off"
            />
            {lineErrors.quantity ? (
              <p className="mt-1 text-xs text-red-600">{lineErrors.quantity}</p>
            ) : null}
          </label>

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={() => router.push(`/cases/${caseId}?tab=products`)}
              disabled={submitting}
              className="rounded-lg border px-6 py-3 text-sm font-bold text-gray-700 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? "追加中..." : "追加する"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
