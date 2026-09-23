"use client";

import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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
    }
  | {
      label: string;
      onClick: () => void | Promise<void>;
      /** 危険操作（削除など）。赤系表示 */
      danger?: boolean;
    }
  | {
      separator: true;
    }
  | {
      node: ReactNode;
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

function deleteConfirmMessage(kind: MasterKind, display: string): string {
  const irreversible =
    kind === "dealer"
      ? "この販売店を完全に削除します。\nこの操作は元に戻せません。"
      : kind === "contractor"
        ? "この施工店を完全に削除します。\nこの操作は元に戻せません。"
        : kind === "package"
          ? "このパッケージ商品を完全に削除します。\nこの操作は元に戻せません。"
          : "このメーカーを完全に削除します。\nこの操作は元に戻せません。";
  return `${irreversible}\n\n対象: 「${display}」\n\n参照中の場合は削除できず、利用停止を案内します。`;
}

/**
 * マスタ一覧の操作列用 ⋯ メニュー。
 * 詳細導線は行内リンク側に置き、ここでは編集・削除など副次操作。
 * マスタ物理削除は管理者のみ表示（/api/auth/me）。
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

  // 先頭・末尾・連続の separator を落とす
  const menuItems: MasterListRowActionItem[] = [];
  for (const item of visibleItems) {
    if ("separator" in item && item.separator) {
      if (menuItems.length === 0) continue;
      const last = menuItems[menuItems.length - 1];
      if (last && "separator" in last && last.separator) continue;
      menuItems.push(item);
      continue;
    }
    menuItems.push(item);
  }
  while (menuItems.length > 0) {
    const last = menuItems[menuItems.length - 1];
    if (!(last && "separator" in last && last.separator)) break;
    menuItems.pop();
  }

  if (menuItems.length === 0) return null;

  async function runDelete(opts: {
    kind: MasterKind;
    id: string;
    name: string;
    listHref: string;
  }) {
    const kindLabel = MASTER_KIND_LABELS[opts.kind];
    const display = opts.name.trim() || kindLabel;
    if (!window.confirm(deleteConfirmMessage(opts.kind, display))) {
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
          {menuItems.map((item, index) => {
            if ("separator" in item && item.separator) {
              return (
                <div
                  key={`sep-${index}`}
                  className="my-1 border-t border-gray-100"
                  role="separator"
                />
              );
            }
            if ("node" in item && item.node) {
              return (
                <div key={`node-${index}`} role="none">
                  {item.node}
                </div>
              );
            }
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
            if ("onClick" in item && item.onClick) {
              return (
                <button
                  key={`click-${item.label}-${index}`}
                  type="button"
                  role="menuitem"
                  className={
                    item.danger
                      ? "block w-full px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                      : "block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                  }
                  onClick={() => {
                    setOpen(false);
                    void item.onClick();
                  }}
                >
                  {item.label}
                </button>
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
