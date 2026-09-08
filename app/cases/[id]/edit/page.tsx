"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  buildConstructionDetailForEdit,
  parseConstructionDetailForEdit,
} from "@/app/components/case-registration/caseRegistrationExtras";

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
  /** 編集UI用。保存時に construction_detail へ再構成 */
  contractor_name: string;
  construction_body: string;
  /** 保存時に担当者・電話ラベル維持用 */
  construction_detail_source: string;
  assigned_user: string;
  department: string;
  priority: string;
  memo: string;
};

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

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
    contractor_name: "",
    construction_body: "",
    construction_detail_source: "",
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

      const detail = (data.construction_detail as string) || "";
      const parsed = parseConstructionDetailForEdit(detail);

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
        contractor_name: parsed.contractor_name,
        construction_body: parsed.construction_body,
        construction_detail_source: detail,
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

    const construction_detail = buildConstructionDetailForEdit({
      contractor_name: form.contractor_name,
      construction_body: form.construction_body,
      previous_detail: form.construction_detail_source,
    });

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
        construction_detail,
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
        <div className="rounded-xl bg-white p-6 shadow-sm text-gray-900">
          読み込み中...
        </div>
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
                className={inputClassName}
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
                className={inputClassName}
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
                className={inputClassName}
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
                className={inputClassName}
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
                className={inputClassName}
              >
                <option>材料のみ</option>
                <option>材工発注</option>
                <option>工事のみ</option>
                <option>見積相談</option>
              </select>
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
                className={inputClassName}
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
                className={inputClassName}
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
              className={inputClassName}
            />
          </label>

          <section className="space-y-4 rounded-lg border border-gray-200 bg-[#f7f7f5] p-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900">工事情報</h2>
              <p className="mt-1 text-xs text-gray-500">
                案件詳細の「工事情報」に反映されます。施工店名は従来どおり
                construction_detail の【施工店名】形式で保存します。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-bold text-gray-500">
                  工事希望日
                </span>
                <input
                  type="date"
                  value={form.construction_desired_date}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      construction_desired_date: e.target.value,
                    }))
                  }
                  className={inputClassName}
                />
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
                  className={inputClassName}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block text-xs font-bold text-gray-500">
                  施工店名
                </span>
                <input
                  value={form.contractor_name}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, contractor_name: e.target.value }))
                  }
                  className={inputClassName}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block text-xs font-bold text-gray-500">
                  工事内容
                </span>
                <textarea
                  rows={3}
                  value={form.construction_body}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      construction_body: e.target.value,
                    }))
                  }
                  className={inputClassName}
                  placeholder="工事内容の自由記述（【施工店名】以外）"
                />
              </label>
            </div>
          </section>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-bold text-gray-500">
              備考
            </span>
            <textarea
              rows={3}
              value={form.memo}
              onChange={(e) => setForm((c) => ({ ...c, memo: e.target.value }))}
              className={inputClassName}
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
