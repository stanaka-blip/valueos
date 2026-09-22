"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  canManuallySetCaseStatusToInvoiced,
  CASE_STATUS_INVOICED,
  countActiveInvoices,
} from "@/lib/cases/caseStatusGuards";
import {
  getCaseStatusBadgeClassName,
  getCaseStatusSelectOptions,
  getCaseStatusSelectValue,
} from "./caseStatus";

export default function StatusSelect({
  caseId,
  currentStatus,
}: {
  caseId: string;
  currentStatus: string | null;
}) {
  const router = useRouter();
  const initialStatus = getCaseStatusSelectValue(currentStatus);
  const options = getCaseStatusSelectOptions(currentStatus);

  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);

  async function handleChange(
    e: React.ChangeEvent<HTMLSelectElement>
  ) {
    const newStatus = e.target.value;
    const previousStatus = status;

    setStatus(newStatus);
    setSaving(true);

    if (newStatus === CASE_STATUS_INVOICED) {
      const { data: invoices, error: invoiceError } = await supabase
        .from("invoices")
        .select("status")
        .eq("case_id", caseId);

      if (invoiceError) {
        setSaving(false);
        setStatus(previousStatus);
        alert(
          "請求書の確認に失敗したため、ステータスを変更できません：" +
            invoiceError.message
        );
        return;
      }

      const guard = canManuallySetCaseStatusToInvoiced({
        nextStatus: newStatus,
        activeInvoiceCount: countActiveInvoices(
          (invoices || []) as { status: string | null }[]
        ),
      });
      if (!guard.ok) {
        setSaving(false);
        setStatus(previousStatus);
        alert(guard.message);
        return;
      }
    }

    const { error } = await supabase
      .from("cases")
      .update({ status: newStatus })
      .eq("id", caseId);

    setSaving(false);

    if (error) {
      setStatus(previousStatus);
      alert("ステータス変更に失敗しました：" + error.message);
      return;
    }

    router.refresh();
  }

  const style = getCaseStatusBadgeClassName(status);

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={saving}
      className={`rounded-full border px-3 py-2 text-xs font-bold disabled:opacity-50 ${style}`}
    >
      {options.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );
}
