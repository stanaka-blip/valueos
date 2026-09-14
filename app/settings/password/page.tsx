"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { validateNewPassword } from "@/lib/auth/inviteSession";

const inputClassName =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

/**
 * ログイン中本人のパスワード変更。
 * 成功後はセッション破棄 → /login（再ログイン）。
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const validation = validateNewPassword({ password, confirm });
    if (validation) {
      setError(validation);
      return;
    }
    if (!currentPassword) {
      setError("現在のパスワードを入力してください");
      return;
    }

    setLoading(true);
    try {
      const csrfRes = await fetch("/api/auth/csrf", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const csrfData = (await csrfRes.json().catch(() => ({}))) as {
        csrfToken?: string;
        error_message?: string;
      };
      if (!csrfRes.ok || !csrfData.csrfToken) {
        setError(csrfData.error_message || "認証が必要です");
        return;
      }

      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfData.csrfToken,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          password,
          confirm,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error_message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error_message || "パスワードを変更できませんでした");
        return;
      }

      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      router.replace("/login?notice=password_changed");
      router.refresh();
    } catch {
      setError("パスワードを変更できませんでした");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">パスワード変更</h1>
            <p className="text-sm text-gray-500">
              ログイン中のアカウントのパスワードを変更します。変更後は再ログインが必要です。
            </p>
          </div>
          <Link
            href="/settings/company"
            className="rounded-lg border px-4 py-2 text-sm font-bold text-gray-700"
          >
            会社情報へ
          </Link>
        </div>
      </header>

      <main className="p-8">
        <form
          onSubmit={onSubmit}
          className="max-w-md space-y-4 rounded-xl bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-gray-700">
            現在のパスワード
            <input
              type="password"
              name="current_password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClassName}
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            新しいパスワード
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClassName}
              required
              minLength={8}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            新しいパスワード（確認）
            <input
              type="password"
              name="confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClassName}
              required
              minLength={8}
            />
          </label>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? "変更中..." : "パスワードを変更"}
          </button>
        </form>
      </main>
    </>
  );
}
