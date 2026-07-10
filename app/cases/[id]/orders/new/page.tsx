"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Supplier = {
  id: string;
  name: string | null;
};

export default function NewOrderPage() {
  const router = useRouter();
  const params = useParams();
  const caseId = params.id as string;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    supplier_id: "",
    order_no: "",
    order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: "",
    order_amount: "",
    status: "発注済",
    memo: "",
  });

  useEffect(() => {
    async function fetchInitialData() {
      const { data: supplierData, error: supplierError } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (supplierError) {
        alert("仕入先取得エラー：" + supplierError.message);
        return;
      }

      setSuppliers(supplierData || []);

      const { data: dealerData } = await supabase
        .from("cases")
        .select(`
          dealer_id,
          dealers (
            default_supplier_id
          )
        `)
        .eq("id", caseId)
        .single();

      const defaultSupplierId =
        dealerData?.dealers?.default_supplier_id || "";

      const { data: caseProducts } = await supabase
        .from("case_products")
        .select("purchase_price")
        .eq("case_id", caseId);

      const totalOrderAmount =
        caseProducts?.reduce(
          (sum, item) => sum + Number(item.purchase_price || 0),
          0
        ) || 0;

      setForm((prev) => ({
        ...prev,
        supplier_id: defaultSupplierId,
        order_amount:
          totalOrderAmount > 0 ? String(totalOrderAmount) : "",
      }));
    }

    fetchInitialData();
  }, [caseId]);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.supplier_id) {
      alert("仕入先を選択してください");
      return;
    }

    if (!form.order_date) {
      alert("発注日を入力してください");
      return;
    }

    if (!form.order_amount) {
      alert("発注金額を入力してください");
      return;
    }

    setLoading(true);

    const { error: orderError } = await supabase.from("orders").insert({
      case_id: caseId,
      supplier_id: form.supplier_id,
      order_no: form.order_no || null,
      order_date: form.order_date,
      expected_delivery_date: form.expected_delivery_date || null,
      order_amount: Number(form.order_amount),
      status: form.status,
      memo: form.memo || null,
    });

    if (orderError) {
      setLoading(false);
      alert("発注登録に失敗しました：" + orderError.message);
      return;
    }

    const { error: caseError } = await supabase
      .from("cases")
      .update({ status: "発注済" })
      .eq("id", caseId);

    setLoading(false);

    if (caseError) {
      alert(
        "発注は登録されましたが、案件ステータス更新に失敗しました：" +
          caseError.message
      );
    }

    router.push(`/cases/${caseId}`);
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-gray-900">発注登録</h1>
        <p className="text-sm text-gray-500">
          案件の発注先・発注日・金額・納期を登録します
        </p>
      </header>

      <main className="p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-5xl rounded-xl bg-white p-8 shadow-sm"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="仕入先">
              <select
                name="supplier_id"
                value={form.supplier_id}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option value="">仕入先を選択</option>

                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="発注番号">
              <input
                name="order_no"
                value={form.order_no}
                onChange={handleChange}
                placeholder="例：PO-202607-001"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="発注日">
              <input
                type="date"
                name="order_date"
                value={form.order_date}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="納品予定日">
              <input
                type="date"
                name="expected_delivery_date"
                value={form.expected_delivery_date}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="発注金額">
              <input
                type="number"
                name="order_amount"
                value={form.order_amount}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="発注ステータス">
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option>未発注</option>
                <option>発注済</option>
                <option>納期回答待ち</option>
                <option>納期確定</option>
                <option>一部納品</option>
                <option>納品済</option>
              </select>
            </Field>
          </div>

          <div className="mt-6">
            <Field label="備考">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div className="mt-8 flex gap-4">
            <button
              type="button"
              onClick={() => router.push(`/cases/${caseId}`)}
              className="rounded-lg border px-6 py-3 text-sm font-bold text-gray-700"
            >
              キャンセル
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "登録中..." : "発注を登録する"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-bold text-gray-700">{label}</p>
      {children}
    </label>
  );
}