"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function EditSupplierPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("id", id)
        .single();
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      setName(data?.name ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("仕入先名を入力してください");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase
      .from("suppliers")
      .update({ name: name.trim() })
      .eq("id", id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/suppliers");
    router.refresh();
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>仕入先編集</h1>
        <p>読み込み中...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>仕入先編集</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>仕入先名</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：〇〇商事"
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </label>
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
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
      </form>
    </main>
  );
}
