"use client";

import { useCallback, useEffect, useState } from "react";

import AttachmentQueue from "./AttachmentQueue";
import {
  attachmentTypeLabel,
  formatByteSize,
  type PendingAttachmentDraft,
  uploadPendingDrafts,
} from "@/lib/caseAttachments/clientUpload";
import type { SafeAttachmentListItem } from "@/lib/caseAttachments/safeDto";

type Props = {
  caseId: string;
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

export default function CaseDocumentsPanel({ caseId }: Props) {
  const [items, setItems] = useState<SafeAttachmentListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<PendingAttachmentDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/attachments`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        attachments?: SafeAttachmentListItem[];
        error_message?: string;
      };
      if (!res.ok || !data.ok) {
        setLoadError(data.error_message || "添付一覧の取得に失敗しました");
        setItems([]);
        return;
      }
      setItems(data.attachments || []);
    } catch {
      setLoadError("添付一覧の取得に失敗しました");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openOrDownload(attachmentId: string, download: boolean) {
    setActionError(null);
    const csrf = await fetchCsrf();
    if (!csrf) {
      setActionError("認証が必要です");
      return;
    }
    const res = await fetch(
      `/api/case-attachments/${attachmentId}/signed-url`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ case_id: caseId }),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      signed_url?: string;
      original_filename?: string;
      error_message?: string;
    };
    if (!res.ok || !data.ok || !data.signed_url) {
      setActionError(data.error_message || "URLの発行に失敗しました");
      return;
    }
    if (download) {
      const a = document.createElement("a");
      a.href = data.signed_url;
      a.download = data.original_filename || "download";
      a.rel = "noopener";
      a.target = "_blank";
      a.click();
    } else {
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    }
  }

  async function softDelete(attachmentId: string) {
    if (!window.confirm("この資料を削除（非表示）しますか？")) return;
    setActionError(null);
    const csrf = await fetchCsrf();
    if (!csrf) {
      setActionError("認証が必要です");
      return;
    }
    const res = await fetch(
      `/api/case-attachments/${attachmentId}/deactivate`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ case_id: caseId }),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error_message?: string;
    };
    if (!res.ok || !data.ok) {
      setActionError(data.error_message || "削除に失敗しました");
      return;
    }
    await reload();
  }

  async function uploadDrafts(onlyFailed = false) {
    const targets = onlyFailed
      ? drafts.filter((d) => d.status === "error" || d.status === "queued")
      : drafts.filter((d) => d.status !== "success");
    if (!targets.length) return;
    setUploading(true);
    setActionError(null);
    try {
      const next = await uploadPendingDrafts({
        caseId,
        drafts: drafts.map((d) =>
          onlyFailed && d.status === "success"
            ? d
            : targets.some((t) => t.localId === d.localId)
              ? { ...d, status: d.status === "success" ? d.status : "queued" }
              : d
        ),
        onUpdate: setDrafts,
      });
      const allOk = next.every((d) => d.status === "success");
      if (allOk) {
        setDrafts([]);
        await reload();
      } else if (next.some((d) => d.status === "success")) {
        await reload();
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-900">資料一覧</h2>
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : null}
        {loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : null}
        {!loading && !loadError && items.length === 0 ? (
          <p className="text-sm text-gray-500">添付資料はありません</p>
        ) : null}
        {items.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900">
                    {item.original_filename}
                  </div>
                  <div className="text-xs text-gray-500">
                    {attachmentTypeLabel(item.attachment_type)} ·{" "}
                    {formatByteSize(item.byte_size)} · {item.uploaded_by_label}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs"
                    onClick={() => void openOrDownload(item.id, false)}
                  >
                    開く
                  </button>
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs"
                    onClick={() => void openOrDownload(item.id, true)}
                  >
                    ダウンロード
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-700"
                    onClick={() => void softDelete(item.id)}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-gray-500">
          変更はできません。差し替えは削除後に再アップロードしてください。
        </p>
      </section>

      <AttachmentQueue
        drafts={drafts}
        onChange={setDrafts}
        disabled={uploading}
        title="資料を追加"
      />

      {actionError ? (
        <p className="text-sm text-red-600">{actionError}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={uploading || drafts.every((d) => d.status === "success") || drafts.length === 0}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void uploadDrafts(false)}
        >
          {uploading ? "アップロード中..." : "アップロード開始"}
        </button>
        {drafts.some((d) => d.status === "error") ? (
          <button
            type="button"
            disabled={uploading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
            onClick={() => void uploadDrafts(true)}
          >
            失敗分を再送
          </button>
        ) : null}
      </div>
    </div>
  );
}
