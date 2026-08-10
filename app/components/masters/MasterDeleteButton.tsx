"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  MASTER_KIND_LABELS,
  type MasterKind,
} from "@/lib/masters/masterKinds";

async function fetchCsrf(): Promise<string | null> {
  const res = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { csrfToken?: string };
  return res.ok && data.csrfToken ? data.csrfToken : null;
}

type Props = {
  kind: MasterKind;
  id: string;
  name: string;
  listHref: string;
};

/**
 * 管理者のみ表示。確認ダイアログ後に POST /api/masters/{kind}/{id}/delete。
 */
export default function MasterDeleteButton({
  kind,
  id,
  name,
  listHref,
}: Props) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!isAdmin) return null;

  async function onDelete() {
    const label = MASTER_KIND_LABELS[kind];
    const display = name.trim() || label;
    const confirmExtra =
      kind === "contractor"
        ? "施工店は案件へコピー参照のため、未使用なら削除できます。運用停止のみなら編集の「無効化」を使ってください。"
        : "案件・価格・商品などから参照されている場合は削除できません。運用停止のみなら編集の「無効化」も利用できます。";
    if (!window.confirm(`「${display}」を削除しますか？\n\n${confirmExtra}`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const csrf = await fetchCsrf();
      if (!csrf) {
        setError("認証が必要です");
        return;
      }
      const res = await fetch(`/api/masters/${kind}/${id}/delete`, {
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
        error_code?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error_message || "削除に失敗しました");
        return;
      }
      router.push(listHref);
      router.refresh();
    } catch {
      setError("削除に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={() => void onDelete()}
        className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {loading ? "削除中..." : "削除"}
      </button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
