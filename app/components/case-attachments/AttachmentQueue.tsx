"use client";

import { useRef, useState } from "react";

import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_CASE,
  type AttachmentTypeId,
} from "@/lib/caseAttachments/constants";
import {
  attachmentTypeLabel,
  createDraftLocalId,
  formatByteSize,
  type PendingAttachmentDraft,
} from "@/lib/caseAttachments/clientUpload";
import { validateFileMeta } from "@/lib/caseAttachments/validation";

type Props = {
  drafts: PendingAttachmentDraft[];
  onChange: (drafts: PendingAttachmentDraft[]) => void;
  disabled?: boolean;
  title?: string;
};

export default function AttachmentQueue({
  drafts,
  onChange,
  disabled = false,
  title = "添付資料",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [defaultType, setDefaultType] = useState<AttachmentTypeId>("other");

  function addFiles(fileList: FileList | File[]) {
    if (disabled) return;
    setFormError(null);
    const files = Array.from(fileList);
    const next = [...drafts];
    for (const file of files) {
      if (next.length >= MAX_ATTACHMENTS_PER_CASE) {
        setFormError(`1案件あたり${MAX_ATTACHMENTS_PER_CASE}件までです`);
        break;
      }
      const metaErr = validateFileMeta({
        originalFilename: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
        attachmentType: defaultType,
      });
      if (metaErr) {
        setFormError(`${file.name}: ${metaErr.error_message}`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setFormError(`${file.name}: 1ファイルあたり20MBまでです`);
        continue;
      }
      next.push({
        localId: createDraftLocalId(),
        file,
        attachmentType: defaultType,
        status: "queued",
        progress: 0,
      });
    }
    onChange(next);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <p className="mt-1 text-xs text-gray-500">
            登録後に直接ストレージへアップロードします（1ファイル20MB / 最大
            {MAX_ATTACHMENTS_PER_CASE}件 / 合計100MB）。
          </p>
        </div>
        <label className="text-xs text-gray-600">
          追加時の種別
          <select
            className="ml-2 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            value={defaultType}
            disabled={disabled}
            onChange={(e) => setDefaultType(e.target.value as AttachmentTypeId)}
          >
            {ATTACHMENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className={`rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
          dragOver
            ? "border-gray-800 bg-gray-50"
            : "border-gray-300 bg-gray-50/50"
        } ${disabled ? "opacity-50" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-gray-700">ファイルをドロップ、または選択</p>
        <p className="mt-1 text-xs text-gray-500">
          pdf / Office / csv / png / jpg
        </p>
        <button
          type="button"
          disabled={disabled}
          className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
          onClick={() => inputRef.current?.click()}
        >
          ファイルを選択
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          accept=".pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.csv,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {formError ? (
        <p className="mt-2 text-sm text-red-600">{formError}</p>
      ) : null}

      {drafts.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {drafts.map((draft) => (
            <li
              key={draft.localId}
              className="rounded border border-gray-100 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900">
                    {draft.file.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatByteSize(draft.file.size)} ·{" "}
                    {attachmentTypeLabel(draft.attachmentType)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    value={draft.attachmentType}
                    disabled={disabled || draft.status === "success"}
                    onChange={(e) => {
                      const nextType = e.target.value as AttachmentTypeId;
                      onChange(
                        drafts.map((d) =>
                          d.localId === draft.localId
                            ? { ...d, attachmentType: nextType }
                            : d
                        )
                      );
                    }}
                  >
                    {ATTACHMENT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {draft.status !== "success" &&
                  draft.status !== "uploading" &&
                  draft.status !== "completing" ? (
                    <button
                      type="button"
                      disabled={disabled}
                      className="text-xs text-red-600 disabled:opacity-50"
                      onClick={() =>
                        onChange(
                          drafts.filter((d) => d.localId !== draft.localId)
                        )
                      }
                    >
                      削除
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded bg-gray-100">
                  <div
                    className={`h-full transition-all ${
                      draft.status === "error"
                        ? "bg-red-500"
                        : draft.status === "success"
                          ? "bg-emerald-600"
                          : "bg-gray-800"
                    }`}
                    style={{
                      width: `${
                        draft.status === "success"
                          ? 100
                          : draft.status === "error"
                            ? 100
                            : draft.progress
                      }%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  {draft.status === "queued" && "待機中"}
                  {draft.status === "uploading" &&
                    `アップロード中 ${draft.progress}%`}
                  {draft.status === "completing" && "確定処理中..."}
                  {draft.status === "success" && "完了"}
                  {draft.status === "error" &&
                    (draft.errorMessage || "失敗")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
