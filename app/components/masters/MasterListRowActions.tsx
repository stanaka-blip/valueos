"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  MASTER_KIND_LABELS,
  type MasterKind,
} from "@/lib/masters/masterKinds";

export type MasterListRowActionItem =
  | {
      label: string;
      href: string;
    }
  | {
      label: string;
      delete: {
        kind: MasterKind;
        id: string;
        name: string;
        listHref: string;
      };
    };

type Props = {
  items: MasterListRowActionItem[];
  /** アクセシビリティ用。例: 商品名 */
  label?: string;
};

async function fetchCsrf(): Promise<string | null> {
  const res = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { csrfToken?: string };
  return res.ok && data.csrfToken ? data.csrfToken : null;
}

/**
 * マスタ一覧の操作列用 ⋯ メニュー。
 * 詳細導線は行内リンク側に置き、ここでは編集・削除など副次操作。
 * 削除は管理者のみ表示（/api/auth/me）。
 */
export default function MasterListRowActions({ items, label }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          user?: { isAdmin?: boolean };
        };
        if (!cancelled) {
          setIsAdmin(Boolean(res.ok && data.ok && data.user?.isAdmin));
        }
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const visibleItems = items.filter((item) => {
    if ("delete" in item && item.delete) return isAdmin;
    return true;
  });

  if (visibleItems.length === 0) return null;

  async function runDelete(opts: {
    kind: MasterKind;
    id: string;
    name: string;
    listHref: string;
  }) {
    const kindLabel = MASTER_KIND_LABELS[opts.kind];
    const display = opts.name.trim() || kindLabel;
    const irreversible =
      opts.kind === "dealer"
        ? "この販売店を完全に削除します。\nこの操作は元に戻せません。"
        : opts.kind === "contractor"
          ? "この施工店を完全に削除します。\nこの操作は元に戻せません。"
          : "このメーカーを完全に削除します。\nこの操作は元に戻せません。";
    if (
      !window.confirm(
        `${irreversible}\n\n対象: 「${display}」\n\n参照中の場合は削除できず、利用停止を案内します。`
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    setOpen(false);
    try {
      const csrf = await fetchCsrf();
      if (!csrf) {
        setError("認証が必要です");
        return;
      }
      const res = await fetch(`/api/masters/${opts.kind}/${opts.id}/delete`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          Origin: window.location.origin,
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error_message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error_message || "削除に失敗しました");
        return;
      }
      router.push(opts.listHref);
      router.refresh();
    } catch {
      setError("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex flex-col items-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label ? `${label}の操作` : "操作メニュー"}
        disabled={deleting}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-md"
        >
          {visibleItems.map((item, index) => {
            if ("href" in item && item.href) {
              return (
                <Link
                  key={`${item.label}-${item.href}`}
                  href={item.href}
                  role="menuitem"
                  className="block px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            }
            if ("delete" in item && item.delete) {
              return (
                <button
                  key={`delete-${item.delete.id}-${index}`}
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                  onClick={() => void runDelete(item.delete)}
                >
                  {item.label}
                </button>
              );
            }
            return null;
          })}
        </div>
      ) : null}
      {error ? (
        <p className="mt-1 max-w-[12rem] text-center text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
