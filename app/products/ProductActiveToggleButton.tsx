"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { supabase } from "@/lib/supabase";

import { toProductActiveDbValue } from "@/lib/products/productActiveContract";

import {
  PRODUCT_DEACTIVATE_CONFIRM,
  PRODUCT_REACTIVATE_CONFIRM,
} from "./productActiveStatus";
import { isProductActiveFlag } from "./productListQuery";

type Props = {
  productId: string;
  productLabel: string;
  isActive: unknown;
  /** button = 単独ボタン / menuitem = ⋯ メニュー内 */
  variant?: "button" | "menuitem";
  className?: string;
  onDone?: () => void;
};

/**
 * 商品の利用停止 / 利用再開。
 * is_active のみ更新。価格・案件・発注は触らない。
 */
export default function ProductActiveToggleButton({
  productId,
  productLabel,
  isActive,
  variant = "button",
  className = "",
  onDone,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentlyActive = isProductActiveFlag(isActive);
  const label = currentlyActive ? "削除（利用停止）" : "利用再開";

  async function handleClick() {
    if (busy) return;
    setError("");
    const ok = window.confirm(
      currentlyActive
        ? PRODUCT_DEACTIVATE_CONFIRM
        : PRODUCT_REACTIVATE_CONFIRM
    );
    if (!ok) return;

    setBusy(true);
    const { error: updateError } = await supabase
      .from("products")
      .update({
        is_active: toProductActiveDbValue(!currentlyActive),
      })
      .eq("id", productId);

    if (updateError) {
      setError(
        `${productLabel}の更新に失敗しました：${updateError.message}`
      );
      setBusy(false);
      return;
    }

    setBusy(false);
    onDone?.();
    router.refresh();
  }

  const baseClass =
    variant === "menuitem"
      ? currentlyActive
        ? "block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        : "block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
      : currentlyActive
        ? "rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
        : "rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50";

  return (
    <div className={variant === "menuitem" ? "" : "inline-flex flex-col items-start gap-1"}>
      <button
        type="button"
        role={variant === "menuitem" ? "menuitem" : undefined}
        disabled={busy}
        onClick={handleClick}
        className={`${baseClass} ${className}`.trim()}
      >
        {busy ? "更新中..." : label}
      </button>
      {error ? (
        <p className="max-w-xs px-3 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
