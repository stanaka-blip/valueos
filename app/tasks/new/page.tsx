"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  Suspense,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

type TaskForm = {
  title: string;
  status: string;
  due_date: string;
  assigned_user: string;
  priority: string;
  memo: string;
};

function NewTaskForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const caseId = searchParams.get("case_id");

  const [form, setForm] = useState<TaskForm>({
    title: "",
    status: "未対応",
    due_date: "",
    assigned_user: "",
    priority: "中",
    memo: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function handleChange(
    event: ChangeEvent<
      HTMLInputElement |
      HTMLTextAreaElement |
      HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSubmitError("");

    if (!form.title.trim()) {
      setSubmitError("タスク名を入力してください。");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase
      .from("tasks")
      .insert({
        case_id: caseId || null,
        title: form.title.trim(),
        status: form.status,
        due_date: form.due_date || null,
        assigned_user:
          form.assigned_user.trim() || null,
        priority: form.priority,
        memo: form.memo.trim() || null,
      });

    if (error) {
      setSubmitError(
        `登録に失敗しました：${error.message}`
      );
      setSubmitting(false);
      return;
    }

    setSubmitting(false);

    router.push(
      caseId ? `/cases/${caseId}` : "/tasks"
    );

    router.refresh();
  }

  function handleCancel() {
    router.push(
      caseId ? `/cases/${caseId}` : "/tasks"
    );
  }

  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <h1 className="text-2xl font-bold text-gray-900">
          タスク登録
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          {caseId
            ? "案件に紐づく対応タスクを登録します"
            : "対応漏れ防止のタスクを登録します"}
        </p>
      </header>

      <main className="p-4 md:p-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl rounded-xl bg-white p-5 shadow-sm md:p-8"
        >
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">
              タスク情報
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              タスク名・期限・担当者を入力してください。
            </p>
          </div>

          {submitError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="タスク名"
              required
            >
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                required
                disabled={submitting}
                placeholder="例：納期確認"
                className={inputClassName}
              />
            </Field>

            <Field
              label="ステータス"
              required
            >
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              >
                <option value="未対応">
                  未対応
                </option>

                <option value="対応中">
                  対応中
                </option>

                <option value="完了">
                  完了
                </option>
              </select>
            </Field>

            <Field label="期限">
              <input
                type="date"
                name="due_date"
                value={form.due_date}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              />
            </Field>

            <Field label="担当者">
              <input
                type="text"
                name="assigned_user"
                value={form.assigned_user}
                onChange={handleChange}
                disabled={submitting}
                placeholder="担当者名"
                className={inputClassName}
              />
            </Field>

            <Field
              label="優先度"
              required
            >
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
                disabled={submitting}
                className={inputClassName}
              >
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </Field>
          </div>

          <div className="mt-5">
            <Field label="メモ">
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={5}
                disabled={submitting}
                placeholder="対応内容や注意事項を入力"
                className={inputClassName}
              />
            </Field>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting
                ? "登録しています..."
                : "登録する"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <NewTaskForm />
    </Suspense>
  );
}

function LoadingPage() {
  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <h1 className="text-2xl font-bold text-gray-900">
          タスク登録
        </h1>
      </header>

      <main className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            読み込み中...
          </p>
        </div>
      </main>
    </>
  );
}

const inputClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100";

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-bold text-gray-700">
        {label}

        {required ? (
          <span className="ml-1 text-red-600">
            *
          </span>
        ) : null}
      </p>

      <div className="mt-2">
        {children}
      </div>
    </div>
  );
}