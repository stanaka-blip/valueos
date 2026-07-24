"use client";

import { FormEvent, useState } from "react";

import { supabase } from "@/lib/supabase";

import { upsertReturnReasonMemo } from "./parseCaseExtras";
import {
  type OrderActionType,
  getAvailableOrderActions,
  getTargetStatusForAction,
} from "./status";

type OrderStatusActionsProps = {
  caseId: string;
  currentStatus: string | null;
  currentMemo: string | null;
  onStatusUpdated: (next: { status: string; memo: string | null }) => void;
};

type DialogMode = OrderActionType | null;

export default function OrderStatusActions({
  caseId,
  currentStatus,
  currentMemo,
  onStatusUpdated,
}: OrderStatusActionsProps) {
  const actions = getAvailableOrderActions(currentStatus);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [returnReason, setReturnReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  if (actions.length === 0 && !successMessage && !actionError) {
    return null;
  }

  function openDialog(mode: OrderActionType) {
    setActionError("");
    setSuccessMessage("");
    setReturnReason("");
    setDialogMode(mode);
  }

  function closeDialog() {
    if (processing) {
      return;
    }
    setDialogMode(null);
    setReturnReason("");
  }

  async function runUpdate(params: {
    action: OrderActionType;
    nextMemo?: string | null;
  }) {
    if (processing) {
      return;
    }

    const available = getAvailableOrderActions(currentStatus);
    if (!available.includes(params.action)) {
      setActionError("現在のステータスではこの操作はできません。");
      setDialogMode(null);
      return;
    }

    setProcessing(true);
    setActionError("");
    setSuccessMessage("");

    const nextStatus = getTargetStatusForAction(params.action);
    const payload: { status: string; memo?: string | null } = {
      status: nextStatus,
    };

    if (params.action === "return" && params.nextMemo !== undefined) {
      payload.memo = params.nextMemo;
    }

    const { error } = await supabase
      .from("cases")
      .update(payload)
      .eq("id", caseId);

    setProcessing(false);

    if (error) {
      console.error("受注ステータス更新に失敗しました:", error);
      if (params.action === "accept") {
        setActionError("受付処理に失敗しました");
      } else if (params.action === "return") {
        setActionError("差し戻し処理に失敗しました");
      } else {
        setActionError("取消処理に失敗しました");
      }
      setDialogMode(null);
      return;
    }

    onStatusUpdated({
      status: nextStatus,
      memo:
        params.action === "return"
          ? params.nextMemo ?? currentMemo
          : currentMemo,
    });

    if (params.action === "accept") {
      setSuccessMessage("受付しました");
    } else if (params.action === "return") {
      setSuccessMessage("差し戻しました");
    } else {
      setSuccessMessage("取消にしました");
    }

    setDialogMode(null);
    setReturnReason("");
  }

  async function handleConfirmAccept() {
    await runUpdate({ action: "accept" });
  }

  async function handleConfirmCancel() {
    await runUpdate({ action: "cancel" });
  }

  async function handleConfirmReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const reason = returnReason.trim();
    if (!reason) {
      setActionError("差し戻し理由を入力してください。");
      return;
    }

    const nextMemo = upsertReturnReasonMemo(currentMemo, reason);
    await runUpdate({ action: "return", nextMemo });
  }

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm md:p-6">
      <h2 className="mb-4 text-lg font-bold text-gray-900">社内処理</h2>

      {successMessage ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {actions.includes("accept") ? (
            <button
              type="button"
              disabled={processing}
              onClick={() => openDialog("accept")}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              受付する
            </button>
          ) : null}

          {actions.includes("return") ? (
            <button
              type="button"
              disabled={processing}
              onClick={() => openDialog("return")}
              className="inline-flex items-center justify-center rounded-lg border border-orange-300 bg-white px-5 py-3 text-sm font-bold text-orange-800 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              差し戻す
            </button>
          ) : null}

          {actions.includes("cancel") ? (
            <button
              type="button"
              disabled={processing}
              onClick={() => openDialog("cancel")}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消にする
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          現在のステータスでは操作できません。
        </p>
      )}

      {dialogMode === "accept" ? (
        <ConfirmDialog
          title="受付確認"
          message="この発注依頼を受付済みにしますか？"
          confirmLabel="受付する"
          processing={processing}
          onCancel={closeDialog}
          onConfirm={handleConfirmAccept}
        />
      ) : null}

      {dialogMode === "cancel" ? (
        <ConfirmDialog
          title="取消確認"
          message="この発注依頼を取消にしますか？"
          confirmLabel="取消にする"
          processing={processing}
          onCancel={closeDialog}
          onConfirm={handleConfirmCancel}
        />
      ) : null}

      {dialogMode === "return" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-dialog-title"
        >
          <form
            onSubmit={handleConfirmReturn}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
          >
            <h3
              id="return-dialog-title"
              className="text-lg font-bold text-gray-900"
            >
              差し戻し確認
            </h3>
            <p className="mt-3 text-sm text-gray-700">
              この発注依頼を差し戻しますか？
            </p>

            <label className="mt-4 block">
              <span className="text-sm font-bold text-gray-700">
                差し戻し理由
                <span className="ml-1 text-red-600">*</span>
              </span>
              <textarea
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
                rows={4}
                disabled={processing}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:bg-gray-100"
                placeholder="差し戻し理由を入力してください"
              />
            </label>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={processing}
                onClick={closeDialog}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={processing}
                className="inline-flex items-center justify-center rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                {processing ? "処理中..." : "差し戻す"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  processing,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  processing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h3
          id="confirm-dialog-title"
          className="text-lg font-bold text-gray-900"
        >
          {title}
        </h3>
        <p className="mt-3 text-sm text-gray-700">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={processing}
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={processing}
            onClick={onConfirm}
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {processing ? "処理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
