"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useState,
} from "react";

import {
  DealerOrderProductForm,
  DealerOrderProductFormErrors,
  ORDER_CATEGORIES,
  PartLine,
  createEmptyPartLine,
} from "./types";
import {
  ManufacturerOption,
  PackageItemOption,
  PackageOption,
  ProductOption,
  SeriesOption,
  fetchActiveManufacturers,
  fetchActivePackages,
  fetchActiveProductSeries,
  fetchActiveProducts,
  fetchPackageItems,
  formatPackageItemLabel,
  formatPackageLabel,
  formatProductLabel,
  getPackagesForSelection,
  getPartProducts,
  getSeriesForManufacturer,
} from "./productMaster";

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

const errorInputClassName = `${inputClassName} border-red-500 focus:border-red-600 focus:ring-red-600`;

type Step2ProductFormProps = {
  productForm: DealerOrderProductForm;
  onProductFormChange: (next: DealerOrderProductForm) => void;
  onBack: () => void;
};

export default function Step2ProductForm({
  productForm,
  onProductFormChange,
  onBack,
}: Step2ProductFormProps) {
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>(
    []
  );
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [packageItems, setPackageItems] = useState<PackageItemOption[]>([]);
  const [packageItemsLoading, setPackageItemsLoading] = useState(false);
  const [packageItemsError, setPackageItemsError] = useState("");
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterError, setMasterError] = useState("");
  const [errors, setErrors] = useState<DealerOrderProductFormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMasters() {
      setMasterLoading(true);
      setMasterError("");

      const [
        manufacturerResult,
        seriesResult,
        packageResult,
        productResult,
      ] = await Promise.all([
        fetchActiveManufacturers(),
        fetchActiveProductSeries(),
        fetchActivePackages(),
        fetchActiveProducts(),
      ]);

      if (cancelled) {
        return;
      }

      if (
        manufacturerResult.errorMessage ||
        seriesResult.errorMessage ||
        packageResult.errorMessage ||
        productResult.errorMessage
      ) {
        setManufacturers([]);
        setSeriesList([]);
        setPackages([]);
        setProducts([]);
        setMasterError("商品マスタの取得に失敗しました");
        setMasterLoading(false);
        return;
      }

      setManufacturers(manufacturerResult.data);
      setSeriesList(seriesResult.data);
      setPackages(packageResult.data);
      setProducts(productResult.data);
      setMasterLoading(false);
    }

    loadMasters();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPackageItems() {
      if (
        productForm.order_category !== "パッケージで発注" ||
        !productForm.package_id
      ) {
        setPackageItems([]);
        setPackageItemsError("");
        setPackageItemsLoading(false);
        return;
      }

      setPackageItemsLoading(true);
      setPackageItemsError("");

      const result = await fetchPackageItems(productForm.package_id);

      if (cancelled) {
        return;
      }

      if (result.errorMessage) {
        setPackageItems([]);
        setPackageItemsError(result.errorMessage);
        setPackageItemsLoading(false);
        return;
      }

      setPackageItems(result.data);
      setPackageItemsLoading(false);
    }

    loadPackageItems();

    return () => {
      cancelled = true;
    };
  }, [productForm.order_category, productForm.package_id]);

  const isPackageOrder = productForm.order_category === "パッケージで発注";
  const isPartsOrder = productForm.order_category === "部材のみ発注";

  const seriesOptions = getSeriesForManufacturer(
    seriesList,
    productForm.manufacturer_id
  );

  const packageOptions = getPackagesForSelection({
    packages,
    manufacturerId: productForm.manufacturer_id,
    seriesId: productForm.series_id,
  });

  const hasSeriesOptions = seriesOptions.length > 0;

  function updateForm(partial: Partial<DealerOrderProductForm>) {
    onProductFormChange({
      ...productForm,
      ...partial,
    });
  }

  function clearError(field: keyof DealerOrderProductFormErrors) {
    if (!submitted) {
      return;
    }

    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleCategoryChange(value: string) {
    updateForm({
      order_category: value as DealerOrderProductForm["order_category"],
      manufacturer_id: "",
      series_id: "",
      package_id: "",
      quantity: productForm.quantity || "1",
      product_memo: "",
      part_lines:
        productForm.part_lines.length > 0
          ? productForm.part_lines
          : [createEmptyPartLine()],
    });
    clearError("order_category");
    clearError("manufacturer_id");
    clearError("package_id");
    clearError("quantity");
    setErrors((current) => {
      if (!current.part_lines) {
        return current;
      }
      const next = { ...current };
      delete next.part_lines;
      return next;
    });
  }

  function handlePackageManufacturerChange(value: string) {
    updateForm({
      manufacturer_id: value,
      series_id: "",
      package_id: "",
    });
    clearError("manufacturer_id");
    clearError("package_id");
  }

  function handleSeriesChange(value: string) {
    updateForm({
      series_id: value,
      package_id: "",
    });
    clearError("package_id");
  }

  function handlePackageFieldChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;

    if (name === "package_id") {
      updateForm({ package_id: value });
      clearError("package_id");
      return;
    }

    if (name === "quantity") {
      updateForm({ quantity: value });
      clearError("quantity");
      return;
    }

    if (name === "product_memo") {
      updateForm({ product_memo: value });
    }
  }

  function updatePartLine(localId: string, partial: Partial<PartLine>) {
    const nextLines = productForm.part_lines.map((line) =>
      line.local_id === localId ? { ...line, ...partial } : line
    );
    updateForm({ part_lines: nextLines });

    if (!submitted) {
      return;
    }

    setErrors((current) => {
      const lineErrors = current.part_lines?.[localId];
      if (!lineErrors) {
        return current;
      }

      const nextLineErrors = { ...lineErrors };
      if ("product_id" in partial) {
        delete nextLineErrors.product_id;
      }
      if ("quantity" in partial) {
        delete nextLineErrors.quantity;
      }

      const nextPartLines = { ...(current.part_lines || {}) };
      if (Object.keys(nextLineErrors).length === 0) {
        delete nextPartLines[localId];
      } else {
        nextPartLines[localId] = nextLineErrors;
      }

      const next = { ...current };
      if (Object.keys(nextPartLines).length === 0) {
        delete next.part_lines;
      } else {
        next.part_lines = nextPartLines;
      }
      return next;
    });
  }

  function handleAddPartLine() {
    updateForm({
      part_lines: [...productForm.part_lines, createEmptyPartLine()],
    });
  }

  function handleRemovePartLine(localId: string) {
    if (productForm.part_lines.length <= 1) {
      return;
    }

    updateForm({
      part_lines: productForm.part_lines.filter(
        (line) => line.local_id !== localId
      ),
    });

    setErrors((current) => {
      if (!current.part_lines?.[localId]) {
        return current;
      }
      const nextPartLines = { ...current.part_lines };
      delete nextPartLines[localId];
      const next = { ...current };
      if (Object.keys(nextPartLines).length === 0) {
        delete next.part_lines;
      } else {
        next.part_lines = nextPartLines;
      }
      return next;
    });
  }

  function validate(): DealerOrderProductFormErrors {
    const nextErrors: DealerOrderProductFormErrors = {};

    if (!productForm.order_category) {
      nextErrors.order_category = "発注区分は必須です";
      return nextErrors;
    }

    if (productForm.order_category === "パッケージで発注") {
      if (!productForm.manufacturer_id) {
        nextErrors.manufacturer_id = "メーカーは必須です";
      }

      if (!productForm.package_id) {
        nextErrors.package_id = "パッケージは必須です";
      }

      const quantity = Number(productForm.quantity);
      if (
        !productForm.quantity.trim() ||
        !Number.isFinite(quantity) ||
        quantity < 1
      ) {
        nextErrors.quantity = "数量は1以上で入力してください";
      }
    }

    if (productForm.order_category === "部材のみ発注") {
      const partLineErrors: NonNullable<
        DealerOrderProductFormErrors["part_lines"]
      > = {};

      for (const line of productForm.part_lines) {
        const lineError: { product_id?: string; quantity?: string } = {};

        if (!line.product_id) {
          lineError.product_id = "商品・部材は必須です";
        }

        const quantity = Number(line.quantity);
        if (
          !line.quantity.trim() ||
          !Number.isFinite(quantity) ||
          quantity < 1
        ) {
          lineError.quantity = "数量は1以上で入力してください";
        }

        if (Object.keys(lineError).length > 0) {
          partLineErrors[line.local_id] = lineError;
        }
      }

      if (Object.keys(partLineErrors).length > 0) {
        nextErrors.part_lines = partLineErrors;
      }
    }

    return nextErrors;
  }

  function handleNext(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSubmitted(true);

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    console.log("新規発注 STEP2 商品情報:", productForm);
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form
      onSubmit={handleNext}
      className="space-y-6"
      noValidate
      method="post"
    >
      {masterLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          読み込み中...
        </div>
      ) : null}

      {masterError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {masterError}
        </div>
      ) : null}

      {hasErrors ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          入力内容をご確認ください。
        </div>
      ) : null}

      <SectionCard title="商品情報">
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="発注区分"
            required
            error={errors.order_category}
          >
            <select
              name="order_category"
              value={productForm.order_category}
              onChange={(event) => handleCategoryChange(event.target.value)}
              className={
                errors.order_category ? errorInputClassName : inputClassName
              }
              aria-invalid={Boolean(errors.order_category)}
              disabled={masterLoading}
            >
              <option value="">選択してください</option>
              {ORDER_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isPackageOrder ? (
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field
              label="メーカー"
              required
              error={errors.manufacturer_id}
            >
              <select
                name="manufacturer_id"
                value={productForm.manufacturer_id}
                onChange={(event) =>
                  handlePackageManufacturerChange(event.target.value)
                }
                className={
                  errors.manufacturer_id ? errorInputClassName : inputClassName
                }
                disabled={masterLoading || Boolean(masterError)}
              >
                <option value="">メーカーを選択</option>
                {manufacturers.length === 0 ? (
                  <option value="" disabled>
                    選択できるデータがありません
                  </option>
                ) : (
                  manufacturers.map((manufacturer) => (
                    <option key={manufacturer.id} value={manufacturer.id}>
                      {manufacturer.name}
                    </option>
                  ))
                )}
              </select>
            </Field>

            <Field
              label="シリーズ"
              description="シリーズがない場合は選択不要"
            >
              <select
                name="series_id"
                value={productForm.series_id}
                onChange={(event) => handleSeriesChange(event.target.value)}
                className={inputClassName}
                disabled={
                  masterLoading ||
                  Boolean(masterError) ||
                  !productForm.manufacturer_id ||
                  !hasSeriesOptions
                }
              >
                {!productForm.manufacturer_id ? (
                  <option value="">メーカーを先に選択</option>
                ) : hasSeriesOptions ? (
                  <>
                    <option value="">シリーズなし</option>
                    {seriesOptions.map((series) => (
                      <option key={series.id} value={series.id}>
                        {series.name}
                      </option>
                    ))}
                  </>
                ) : (
                  <option value="">シリーズなし</option>
                )}
              </select>
            </Field>

            <Field
              label="パッケージ"
              required
              error={errors.package_id}
            >
              <select
                name="package_id"
                value={productForm.package_id}
                onChange={handlePackageFieldChange}
                className={
                  errors.package_id ? errorInputClassName : inputClassName
                }
                disabled={
                  masterLoading ||
                  Boolean(masterError) ||
                  !productForm.manufacturer_id
                }
              >
                <option value="">パッケージを選択</option>
                {!productForm.manufacturer_id ? (
                  <option value="" disabled>
                    メーカーを先に選択
                  </option>
                ) : packageOptions.length === 0 ? (
                  <option value="" disabled>
                    選択できるデータがありません
                  </option>
                ) : (
                  packageOptions.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {formatPackageLabel(pkg)}
                    </option>
                  ))
                )}
              </select>
            </Field>

            <Field label="数量" required error={errors.quantity}>
              <input
                type="number"
                name="quantity"
                value={productForm.quantity}
                onChange={handlePackageFieldChange}
                min="1"
                step="1"
                className={
                  errors.quantity ? errorInputClassName : inputClassName
                }
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="商品備考">
                <textarea
                  name="product_memo"
                  value={productForm.product_memo}
                  onChange={handlePackageFieldChange}
                  rows={3}
                  className={inputClassName}
                />
              </Field>
            </div>

            {productForm.package_id ? (
              <div className="md:col-span-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-800">
                    パッケージ内容
                  </p>
                  {packageItemsLoading ? (
                    <p className="mt-3 text-sm text-gray-600">読み込み中...</p>
                  ) : null}
                  {packageItemsError ? (
                    <p className="mt-3 text-sm text-red-600">
                      {packageItemsError}
                    </p>
                  ) : null}
                  {!packageItemsLoading &&
                  !packageItemsError &&
                  packageItems.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600">
                      このパッケージに紐づく商品はありません。
                    </p>
                  ) : null}
                  {!packageItemsLoading &&
                  !packageItemsError &&
                  packageItems.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {packageItems.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-gray-800"
                        >
                          <span>{formatPackageItemLabel(item)}</span>
                          <span className="text-gray-600">
                            × {item.quantity}
                            {item.requirement_type
                              ? `（${item.requirement_type}）`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {isPartsOrder ? (
          <div className="mt-5 space-y-5">
            {productForm.part_lines.map((line, index) => {
              const lineProducts = getPartProducts({
                products,
                manufacturerId: line.manufacturer_id,
              });
              const lineErrors = errors.part_lines?.[line.local_id];

              return (
                <div
                  key={line.local_id}
                  className="rounded-lg border border-gray-200 p-4 md:p-5"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-gray-800">
                      部材 {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRemovePartLine(line.local_id)}
                      disabled={productForm.part_lines.length <= 1}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      削除
                    </button>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="メーカー">
                      <select
                        value={line.manufacturer_id}
                        onChange={(event) =>
                          updatePartLine(line.local_id, {
                            manufacturer_id: event.target.value,
                            product_id: "",
                          })
                        }
                        className={inputClassName}
                        disabled={masterLoading || Boolean(masterError)}
                      >
                        <option value="">メーカー指定なし</option>
                        {manufacturers.map((manufacturer) => (
                          <option
                            key={manufacturer.id}
                            value={manufacturer.id}
                          >
                            {manufacturer.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="商品・部材"
                      required
                      error={lineErrors?.product_id}
                    >
                      <select
                        value={line.product_id}
                        onChange={(event) =>
                          updatePartLine(line.local_id, {
                            product_id: event.target.value,
                          })
                        }
                        className={
                          lineErrors?.product_id
                            ? errorInputClassName
                            : inputClassName
                        }
                        disabled={masterLoading || Boolean(masterError)}
                      >
                        <option value="">選択してください</option>
                        {lineProducts.length === 0 ? (
                          <option value="" disabled>
                            選択できるデータがありません
                          </option>
                        ) : (
                          lineProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {formatProductLabel(product)}
                            </option>
                          ))
                        )}
                      </select>
                    </Field>

                    <Field
                      label="数量"
                      required
                      error={lineErrors?.quantity}
                    >
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(event) =>
                          updatePartLine(line.local_id, {
                            quantity: event.target.value,
                          })
                        }
                        min="1"
                        step="1"
                        className={
                          lineErrors?.quantity
                            ? errorInputClassName
                            : inputClassName
                        }
                      />
                    </Field>

                    <div className="md:col-span-2">
                      <Field label="商品備考">
                        <textarea
                          value={line.product_memo}
                          onChange={(event) =>
                            updatePartLine(line.local_id, {
                              product_memo: event.target.value,
                            })
                          }
                          rows={3}
                          className={inputClassName}
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleAddPartLine}
              className="inline-flex items-center justify-center rounded-lg border border-dashed border-gray-400 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              ＋部材を追加
            </button>
          </div>
        ) : null}
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
          type="button"
          onClick={() => handleNext()}
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700"
        >
          次へ
        </button>
      </div>
    </form>
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
        <span
          role="alert"
          className="mt-1.5 block text-sm font-medium text-red-600"
        >
          {error}
        </span>
      ) : null}
    </label>
  );
}
