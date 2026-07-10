"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NewTaskPage() {
  const router = useRouter();

  const searchParams = useSearchParams();
const caseId = searchParams.get("case_id");

  const [form, setForm] = useState({
    title: "",
    status: "未対応",
    due_date: "",
    assigned_user: "",
    priority: "中",
    memo: "",
  });

  const [loading, setLoading] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("tasks").insert({
  case_id: caseId,
  title: form.title,
  status: form.status,
  due_date: form.due_date || null,
  assigned_user: form.assigned_user,
  priority: form.priority,
  memo: form.memo,
});

    setLoading(false);

    if (error) {
      alert("登録に失敗しました：" + error.message);
      return;
    }

    router.push(caseId ? `/cases/${caseId}` : "/tasks");
    router.refresh();
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">タスク登録</h1>
        <p className="text-sm text-gray-500">対応漏れ防止のタスクを登録します</p>
      </header>

      <form onSubmit={handleSubmit} className="p-8">
        <div className="max-w-3xl rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="タスク名">
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                required
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="ステータス">
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option>未対応</option>
                <option>対応中</option>
                <option>完了</option>
              </select>
            </Field>

            <Field label="期限">
              <input
                name="due_date"
                value={form.due_date}
                onChange={handleChange}
                type="date"
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="担当者">
              <input
                name="assigned_user"
                value={form.assigned_user}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>

            <Field label="優先度">
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              >
                <option>高</option>
                <option>中</option>
                <option>低</option>
              </select>
            </Field>
          </div>

          <div className="mt-5">
            <Field label="メモ">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-lg border px-4 py-3 text-sm"
              />
            </Field>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/tasks")}
              className="rounded-lg border px-5 py-3 text-sm font-bold text-gray-700"
            >
              キャンセル
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "登録中..." : "登録する"}
            </button>
          </div>
        </div>
      </form>
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