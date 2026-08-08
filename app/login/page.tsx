"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

/**
 * 社内ログイン（Supabase Auth email + password）。
 * 新規会員登録への導線は置かない（invite-only）。
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: window.location.origin,
        },
        body: JSON.stringify({
          email,
          password,
          next: searchParams.get("next") || "/",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        next?: string;
        error_message?: string;
        csrfToken?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error_message || "認証に失敗しました");
        return;
      }
      if (data.csrfToken) {
        sessionStorage.setItem("vos_csrf_token", data.csrfToken);
      }
      router.replace(
        typeof data.next === "string" && data.next.startsWith("/")
          ? data.next
          : "/"
      );
      router.refresh();
    } catch {
      setError("認証に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-lg bg-white p-8 shadow">
      <h1 className="text-xl font-bold text-gray-900">社内ログイン</h1>
      <p className="mt-2 text-sm text-gray-600">
        社内メンバー用です。アカウントは管理者から招待・作成されます。
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          メールアドレス
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          パスワード
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {loading ? "確認中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8">読み込み中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
