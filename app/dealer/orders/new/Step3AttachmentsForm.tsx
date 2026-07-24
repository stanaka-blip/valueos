"use client";

import { ChangeEvent, ReactNode, useState } from "react";

type AttachmentDraft = {
  local_id: string;
  file_name: string;
  note: string;
};

type Step3AttachmentsFormProps = {
  onBack: () => void;
  onConfirm: () => void;
};

export default function Step3AttachmentsForm({
  onBack,
  onConfirm,
}: Step3AttachmentsFormProps) {
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [note, setNote] = useState("");

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const next = files.map((file) => ({
      local_id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file_name: file.name,
      note: "",
    }));

    setAttachments((current) => [...current, ...next]);
    event.target.value = "";
  }

  function handleRemove(localId: string) {
    setAttachments((current) =>
      current.filter((item) => item.local_id !== localId)
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title="添付資料">
        <p className="mb-5 text-sm text-gray-600">
          図面・仕様書などの資料がある場合は追加してください。添付は任意です。
        </p>

        <div className="space-y-5">
          <Field label="ファイルを選択">
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-900 file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white hover:file:bg-gray-700"
            />
          </Field>

          {attachments.length > 0 ? (
            <ul className="space-y-3">
              {attachments.map((item) => (
                <li
                  key={item.local_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
                >
                  <span className="text-sm font-medium text-gray-800">
                    {item.file_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.local_id)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              まだファイルは選択されていません。
            </p>
          )}

          <Field label="添付に関するメモ">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="任意"
              className={inputClassName}
            />
          </Field>
        </div>
      </SectionCard>

      <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          戻る
        </button>

        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:bg-gray-700"
        >
          確認へ
        </button>
      </div>
    </div>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
      <h2 className="mb-5 text-lg font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-gray-700">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
