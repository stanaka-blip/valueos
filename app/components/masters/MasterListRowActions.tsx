"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type MasterListRowActionItem = {
  label: string;
  href: string;
};

type Props = {
  items: MasterListRowActionItem[];
  /** アクセシビリティ用。例: 商品名 */
  label?: string;
};

/**
 * マスタ一覧の操作列用 ⋯ メニュー。
 * 詳細導線は行内リンク側に置き、ここでは編集・価格追加など副次操作のみ。
 */
export default function MasterListRowActions({ items, label }: Props) {
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

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative inline-flex justify-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label ? `${label}の操作` : "操作メニュー"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50"
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-md"
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
        </div>
      ) : null}
    </div>
  );
}
