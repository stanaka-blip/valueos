"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const statuses = ["未対応", "対応中", "完了"];

export default function TaskStatusSelect({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: string | null;
}) {
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;

    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (error) {
      alert("ステータス変更に失敗しました：" + error.message);
      return;
    }

    router.refresh();
  }

  return (
    <select
      value={currentStatus || "未対応"}
      onChange={handleChange}
      className="rounded-full border bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"
    >
      {statuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}