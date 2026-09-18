"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import ProductActiveToggleButton from "./ProductActiveToggleButton";

type LinkItem = {
  label: string;
  href: string;
};

type Props = {
  productId: string;
  productLabel: string;
  isActive: unknown;
  items: LinkItem[];
};

/**
 * 商品一覧の操作メニュー（編集・複製・価格 + 利用停止/再開）。
 */
export default function ProductListRowActions({
  productId,
  productLabel,
  isActive,
  items,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex justify-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${productLabel}の操作`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50"
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-lg border border-gray-200 bg-white py-1 shadow-md"
        >
          {items.map((item) => (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              role="menuitem"
              className="block px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <ProductActiveToggleButton
            productId={productId}
            productLabel={productLabel}
            isActive={isActive}
            variant="menuitem"
            onDone={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
