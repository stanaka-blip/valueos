"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const statuses = [
  "新規受付",
  "内容確認中",
  "見積作成中",
  "見積提出済",
  "受注確定",
  "発注待ち",
  "発注済",
  "納期回答待ち",
  "納品待ち",
  "納品済",
  "工事日調整中",
  "工事待ち",
  "施工中",
  "完工",
  "請求待ち",
  "請求済",
  "入金待ち",
  "入金済",
  "保留",
  "キャンセル",
];

const statusStyles: Record<string, string> = {
  新規受付: "bg-gray-100 text-gray-700",
  内容確認中: "bg-blue-100 text-blue-700",
  見積作成中: "bg-yellow-100 text-yellow-700",
  見積提出済: "bg-purple-100 text-purple-700",
  受注確定: "bg-green-100 text-green-700",

  発注待ち: "bg-orange-100 text-orange-700",
  発注済: "bg-indigo-100 text-indigo-700",
  納期回答待ち: "bg-yellow-100 text-yellow-800",

  納品待ち: "bg-amber-100 text-amber-700",
  納品済: "bg-emerald-100 text-emerald-700",

  工事日調整中: "bg-cyan-100 text-cyan-700",
  工事待ち: "bg-sky-100 text-sky-700",
  施工中: "bg-blue-100 text-blue-800",
  完工: "bg-green-200 text-green-800",

  請求待ち: "bg-red-100 text-red-700",
  請求済: "bg-violet-100 text-violet-700",
  入金待ち: "bg-rose-100 text-rose-700",
  入金済: "bg-emerald-200 text-emerald-800",

  保留: "bg-gray-200 text-gray-700",
  キャンセル: "bg-gray-300 text-gray-600",
};

export default function StatusSelect({
  caseId,
  currentStatus,
}: {
  caseId: string;
  currentStatus: string | null;
}) {
  const router = useRouter();
  const current = currentStatus || "新規受付";

  const [status, setStatus] = useState(current);
  const [saving, setSaving] = useState(false);

  async function handleChange(
    e: React.ChangeEvent<HTMLSelectElement>
  ) {
    const newStatus = e.target.value;
    const previousStatus = status;

    setStatus(newStatus);
    setSaving(true);

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

  const style =
    statusStyles[status] || "bg-gray-100 text-gray-700";

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={saving}
      className={`rounded-full border px-3 py-2 text-xs font-bold disabled:opacity-50 ${style}`}
    >
      {statuses.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );
}