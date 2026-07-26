"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SalesPriceActions({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm("この販売価格を削除しますか？")) return;
    setDeleting(true);
    const { error } = await supabase.from("sales_prices").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      alert("削除に失敗しました：" + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex justify-center gap-2">
      <Link
        href={`/sales-prices/${id}/edit`}
        className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-700"
      >
        編集
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? "削除中..." : "削除"}
      </button>
    </div>
  );
}
