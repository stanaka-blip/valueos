"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StaffRow = {
  id: string;
  display_name: string;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  email_confirmed: boolean;
  created_at: string;
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

export default function StaffAdminPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        staff?: StaffRow[];
        error_code?: string;
        error_message?: string;
      };
      if (res.status === 403 || data.error_code === "NOT_ADMIN") {
        router.replace("/");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error_message || "一覧の取得に失敗しました");
        setStaff([]);
        return;
      }
      setStaff(data.staff || []);
    } catch {
      setError("一覧の取得に失敗しました");
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setToast(null);
    setError(null);
    try {
      const csrf = await fetchCsrf();
      if (!csrf) {
        setError("認証が必要です");
        return;
      }
      const res = await fetch("/api/staff", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          display_name: displayName,
          email,
          is_admin: asAdmin,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error_message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error_message || "招待に失敗しました");
        return;
      }
      setToast("招待メールを送信しました");
      setDisplayName("");
      setEmail("");
      setAsAdmin(false);
      setShowForm(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function setActive(id: string, isActive: boolean) {
    if (actionId) return;
    setActionId(id);
    setError(null);
    setToast(null);
    try {
      const csrf = await fetchCsrf();
      if (!csrf) {
        setError("認証が必要です");
        return;
      }
      const res = await fetch(`/api/staff/${id}/active`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ is_active: isActive }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error_message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error_message || "更新に失敗しました");
        return;
      }
      setToast(isActive ? "ユーザーを有効化しました" : "ユーザーを無効化しました");
      await load();
    } finally {
      setActionId(null);
    }
  }

  async function resend(id: string) {
    if (actionId) return;
    setActionId(id);
    setError(null);
    setToast(null);
    try {
      const csrf = await fetchCsrf();
      if (!csrf) {
        setError("認証が必要です");
        return;
      }
      const res = await fetch(`/api/staff/${id}/resend-invite`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error_message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error_message || "再送に失敗しました");
        return;
      }
      setToast("招待メールを再送しました");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ユーザー管理</h1>
          <p className="mt-1 text-sm text-gray-600">
            社内メンバーの招待・有効/無効を管理します。削除はせず無効化します。
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "閉じる" : "＋ユーザー追加"}
        </button>
      </div>

      {toast ? (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form
          onSubmit={onInvite}
          className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-white p-4"
        >
          <h2 className="text-sm font-bold text-gray-900">ユーザーを招待</h2>
          <label className="block text-sm text-gray-700">
            氏名
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={80}
            />
          </label>
          <label className="block text-sm text-gray-700">
            メールアドレス
            <input
              type="email"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={asAdmin}
              onChange={(e) => setAsAdmin(e.target.checked)}
            />
            管理者として追加
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "送信中..." : "招待メールを送る"}
          </button>
        </form>
      ) : null}

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">氏名</th>
              <th className="px-4 py-3 font-medium">メールアドレス</th>
              <th className="px-4 py-3 font-medium">状態</th>
              <th className="px-4 py-3 font-medium">管理者</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-gray-500">
                  読み込み中...
                </td>
              </tr>
            ) : null}
            {!loading && staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-gray-500">
                  ユーザーがいません
                </td>
              </tr>
            ) : null}
            {staff.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {row.display_name}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {row.email || "—"}
                  {!row.email_confirmed && row.is_active ? (
                    <span className="ml-2 text-xs text-amber-700">未確認</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {row.is_active ? (
                    <span className="text-emerald-700">有効</span>
                  ) : (
                    <span className="text-gray-500">無効</span>
                  )}
                </td>
                <td className="px-4 py-3">{row.is_admin ? "はい" : "いいえ"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {row.is_active ? (
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                        onClick={() => void setActive(row.id, false)}
                      >
                        無効化
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                        onClick={() => void setActive(row.id, true)}
                      >
                        有効化
                      </button>
                    )}
                    {row.is_active && !row.email_confirmed ? (
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                        onClick={() => void resend(row.id)}
                      >
                        招待再送
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
