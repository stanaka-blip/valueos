"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type CaseEditForm = {
  case_no: string;
  customer_name: string;
  customer_phone: string;
  site_address: string;
  order_type: string;
  order_received_date: string;
  desired_delivery_date: string;
  delivery_address: string;
  construction_desired_date: string;
  construction_detail: string;
  assigned_user: string;
  department: string;
  priority: string;
  memo: string;
};

export default function EditCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CaseEditForm>({
    case_no: "",
    customer_name: "",
    customer_phone: "",
    site_address: "",
    order_type: "材工発注",
    order_received_date: "",
    desired_delivery_date: "",
    delivery_address: "",
    construction_desired_date: "",
    construction_detail: "",
    assigned_user: "",
    department: "",
    priority: "中",
    memo: "",
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from("cases")
        .select(
          `
          case_no,
          customer_name,
          customer_phone,
          site_address,
          order_type,
          order_received_date,
          desired_delivery_date,
          delivery_address,
          construction_desired_date,
          construction_detail,
          assigned_user,
          department,
          priority,
          memo
        `
        )
        .eq("id", id)
        .single();

      if (loadError || !data) {
        setError(loadError?.message || "案件が見つかりません");
        setLoading(false);
        return;
      }

      setForm({
        case_no: (data.case_no as string) || "",
        customer_name: (data.customer_name as string) || "",
        customer_phone: (data.customer_phone as string) || "",
        site_address: (data.site_address as string) || "",
        order_type: (data.order_type as string) || "材工発注",
        order_received_date: ((data.order_received_date as string) || "").slice(
          0,
          10
        ),
        desired_delivery_date: (
          (data.desired_delivery_date as string) || ""
        ).slice(0, 10),
        delivery_address: (data.delivery_address as string) || "",
        construction_desired_date: (
          (data.construction_desired_date as string) || ""
        ).slice(0, 10),
        construction_detail: (data.construction_detail as string) || "",
        assigned_user: (data.assigned_user as string) || "",
        department: (data.department as string) || "",
        priority: (data.priority as string) || "中",
        memo: (data.memo as string) || "",
      });
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.order_received_date) {
      setError("受注日を入力してください");
      return;
    }
    setSaving(true);
    setError("");

    const { error: saveError } = await supabase
      .from("cases")
      .update({
        case_no: form.case_no || null,
        customer_name: form.customer_name || null,
        customer_phone: form.customer_phone || null,
        site_address: form.site_address || null,
        order_type: form.order_type || null,
        order_received_date: form.order_received_date,
        desired_delivery_date: form.desired_delivery_date || null,
        delivery_address: form.delivery_address || null,
        construction_desired_date: form.construction_desired_date || null,
        construction_detail: form.construction_detail || null,
        assigned_user: form.assigned_user || null,
        department: form.department || null,
        priority: form.priority || null,
        memo: form.memo || null,
      })
      .eq("id", id);

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    router.push(`/cases/${id}`);
    router.refresh();
  }

  if (loading) {
    return (
      <main className="p-8">
        <div className="rounded-xl bg-white p-6 shadow-sm">読み込み中...</div>
      </main>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">案件編集</h1>
            <p className="text-sm text-gray-500">
              受注日を変更するとダッシュボードの売上集計期間も変わります
            </p>
          </div>
          <Link
            href={`/cases/${id}`}
            className="rounded-lg border px-4 py-2 text-sm font-bold text-gray-700"
          >
            詳細へ戻る
          </Link>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="p-8">
        <div className="max-w-4xl space-y-5 rounded-xl bg-white p-6 shadow-sm">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-gray-500">
                案件番号
              </span>
              <input
                value={form.case_no}
                onChange={(e) =>
                  setForm((c) => ({ ...c, case_no: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-gray-500">
                受注日 *
              </span>
              <input
                type="date"
                required
                value={form.order_received_date}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    order_received_date: e.target.value,
                  }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-gray-500">
                顧客名
              </span>
              <input
                value={form.customer_name}
                onChange={(e) =>
                  setForm((c) => ({ ...c, customer_name: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-gray-500">
                電話番号
              </span>
              <input
                value={form.customer_phone}
                onChange={(e) =>
                  setForm((c) => ({ ...c, customer_phone: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-gray-500">
                発注区分
              </span>
              <select
                value={form.order_type}
                onChange={(e) =>
                  setForm((c) => ({ ...c, order_type: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option>材料のみ</option>
                <option>材工発注</option>
                <option>工事のみ</option>
                <option>見積相談</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-gray-500">
                希望納期
              </span>
              <input
                type="date"
                value={form.desired_delivery_date}
                onChange={(e) =>
                  setForm((c) => ({
                    ...c,
                    desired_delivery_date: e.target.value,
                  }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-gray-500">
                担当者
              </span>
              <input
                value={form.assigned_user}
                onChange={(e) =>
                  setForm((c) => ({ ...c, assigned_user: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold text-gray-500">
                部署
              </span>
              <input
                value={form.department}
                onChange={(e) =>
                  setForm((c) => ({ ...c, department: e.target.value }))
                }
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-bold text-gray-500">
              施工先住所
            </span>
            <input
              value={form.site_address}
              onChange={(e) =>
                setForm((c) => ({ ...c, site_address: e.target.value }))
              }
              className="w-full rounded-lg border px-4 py-3 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-bold text-gray-500">
              備考
            </span>
            <textarea
              rows={3}
              value={form.memo}
              onChange={(e) => setForm((c) => ({ ...c, memo: e.target.value }))}
              className="w-full rounded-lg border px-4 py-3 text-sm"
            />
          </label>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <Link
              href={`/cases/${id}`}
              className="rounded-lg border px-5 py-2.5 text-sm font-bold text-gray-700"
            >
              キャンセル
            </Link>
          </div>
        </div>
      </form>
    </>
  );
}
