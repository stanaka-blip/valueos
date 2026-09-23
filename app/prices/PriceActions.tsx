"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import MasterListRowActions from "@/app/components/masters/MasterListRowActions";
import { supabase } from "@/lib/supabase";

/**
 * 仕入価格一覧の操作列（⋯: 編集 / 複製 / 削除）。
 * 削除の挙動は従来どおり（クライアント直 delete）。UIのみ統一。
 */
export default function PriceActions({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm("この仕入価格を削除しますか？")) return;
    setDeleting(true);
    const { error } = await supabase
      .from("purchase_prices")
      .delete()
      .eq("id", id);
    setDeleting(false);
    if (error) {
      alert("削除に失敗しました：" + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <MasterListRowActions
      label="仕入価格"
      items={[
        { label: "編集", href: `/prices/${id}/edit` },
        { label: "複製して新規登録", href: `/prices/new?copyFrom=${id}` },
        {
          label: deleting ? "削除中..." : "削除",
          danger: true,
          onClick: onDelete,
        },
      ]}
    />
  );
}
