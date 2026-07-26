"use client";

import { FormEvent, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function EditDealerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    payment_type: "売掛",
    credit_limit: "",
    sales_person: "",
    memo: "",
    is_active: true,
  });

  useEffect(() => {
    supabase
      .from("dealers")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError(fetchError?.message || "販売店が見つかりません");
          setLoading(false);
          return;
        }
        setForm({
          name: (data.name as string) || "",
          contact_name: (data.contact_name as string) || "",
          phone: (data.phone as string) || "",
          email: (data.email as string) || "",
          address: (data.address as string) || "",
          payment_type: (data.payment_type as string) || "売掛",
          credit_limit:
            data.credit_limit != null ? String(data.credit_limit) : "",
          sales_person: (data.sales_person as string) || "",
          memo: (data.memo as string) || "",
          is_active: Boolean(data.is_active),
        });
        setLoading(false);
      });
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("販売店名を入力してください");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from("dealers")
      .update({
        name: form.name.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        payment_type: form.payment_type || null,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        sales_person: form.sales_person.trim() || null,
        memo: form.memo.trim() || null,
        is_active: form.is_active,
      })
      .eq("id", id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/dealers");
    router.refresh();
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>販売店編集</h1>
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>販売店編集</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {(
          [
            ["name", "販売店名"],
            ["contact_name", "担当者名"],
            ["phone", "電話番号"],
            ["email", "メール"],
            ["address", "住所"],
            ["sales_person", "担当営業"],
            ["credit_limit", "売掛上限"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} style={{ display: "grid", gap: 6 }}>
            <span>{label}</span>
            <input
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
            />
          </label>
        ))}

        <label style={{ display: "grid", gap: 6 }}>
          <span>決済条件</span>
          <select
            value={form.payment_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, payment_type: e.target.value }))
            }
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          >
            <option value="売掛">売掛</option>
            <option value="現金">現金</option>
            <option value="その他">その他</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>備考</span>
          <textarea
            value={form.memo}
            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
            rows={4}
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_active: e.target.checked }))
            }
          />
          有効
        </label>

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => router.push("/dealers")}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fff",
            }}
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </form>
    </main>
  );
}
