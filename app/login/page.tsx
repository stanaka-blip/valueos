"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

/**
 * 暫定社内ログイン画面。
 * Supabase Auth の代替として恒久化しない。将来の本格 Auth へ置換予定。
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      // login 直後の互換用。再読込・別タブでは GET /api/auth/csrf から再取得すること。
      if (data.csrfToken) {
        sessionStorage.setItem("vos_csrf_token", data.csrfToken);
      }
      router.replace(typeof data.next === "string" && data.next.startsWith("/") ? data.next : "/");
      router.refresh();
    } catch {
      setError("認証に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-lg bg-white p-8 shadow">
      <h1 className="text-xl font-bold text-gray-900">社内ログイン（暫定）</h1>
      <p className="mt-2 text-sm text-gray-600">
        社内業務画面用の暫定認証です。Supabase Auth ではありません。
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
