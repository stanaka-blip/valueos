"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import { createBrowserAuthClient } from "@/lib/auth/browserAuthClient";
import {
  INVITE_LINK_EXPIRED_MESSAGE,
  establishSessionFromAuthCallback,
  validateNewPassword,
} from "@/lib/auth/inviteSession";

type Phase = "loading" | "ready" | "expired" | "done";

/**
 * Supabase invite / recovery コールバック。
 * セッションは一時的にブラウザ Auth クライアント内のみ。
 * パスワード設定後は signOut → /login（staff cookie は発行しない）。
 */
function SetPasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [client] = useState(() => {
    try {
      return createBrowserAuthClient();
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!client) {
        setPhase("expired");
        setError(INVITE_LINK_EXPIRED_MESSAGE);
        return;
      }
      try {
        const result = await establishSessionFromAuthCallback(
          client,
          window.location.search,
          window.location.hash
        );
        if (cancelled) return;
        if (!result.ok) {
          setPhase("expired");
          setError(result.message);
          return;
        }
        setEmail(result.email);
        window.history.replaceState({}, "", window.location.pathname);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("expired");
          setError(INVITE_LINK_EXPIRED_MESSAGE);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!client) {
      setPhase("expired");
      setError(INVITE_LINK_EXPIRED_MESSAGE);
      return;
    }

    const validation = validateNewPassword({ password, confirm });
    if (validation) {
      setError(validation);
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session) {
        setPhase("expired");
        setError(INVITE_LINK_EXPIRED_MESSAGE);
        return;
      }

      const { error: updateError } = await client.auth.updateUser({
        password,
      });
      if (updateError) {
        const msg = (updateError.message || "").toLowerCase();
        if (
          msg.includes("expired") ||
          msg.includes("invalid") ||
          msg.includes("session")
        ) {
          setPhase("expired");
          setError(INVITE_LINK_EXPIRED_MESSAGE);
          return;
        }
        setError(updateError.message || "パスワードを設定できませんでした");
        return;
      }

      await client.auth.signOut().catch(() => undefined);
      setPhase("done");
      router.replace("/login?notice=password_set");
      router.refresh();
    } catch {
      setError("パスワードを設定できませんでした");
    } finally {
      setLoading(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="mx-auto mt-16 w-full max-w-md rounded-lg bg-white p-8 shadow">
        <p className="text-sm text-gray-600">招待リンクを確認しています...</p>
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <div className="mx-auto mt-16 w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-bold text-gray-900">招待リンクエラー</h1>
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error || INVITE_LINK_EXPIRED_MESSAGE}
        </p>
        <p className="mt-3 text-sm text-gray-600">
          管理者に招待メールの再送を依頼してください。
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-gray-900 underline"
        >
          ログイン画面へ
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-lg bg-white p-8 shadow">
      <h1 className="text-xl font-bold text-gray-900">パスワード設定</h1>
      <p className="mt-2 text-sm text-gray-600">
        招待されたアカウントの初回パスワードを設定してください。設定後、メールアドレスとパスワードでログインできます。
      </p>
      {email ? (
        <p className="mt-3 text-sm text-gray-800">
          メールアドレス: <span className="font-medium">{email}</span>
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          パスワード
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            required
            minLength={8}
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          パスワード確認
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
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
          disabled={loading || phase === "done"}
          className="w-full rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {loading ? "設定中..." : "パスワードを設定"}
        </button>
      </form>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8">読み込み中...</div>}>
      <SetPasswordForm />
    </Suspense>
  );
}
