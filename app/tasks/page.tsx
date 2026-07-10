import TaskStatusSelect from "./TaskStatusSelect";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string;
  created_at: string | null;
  case_id: string | null;
  title: string | null;
  status: string | null;
  due_date: string | null;
  assigned_user: string | null;
  priority: string | null;
  memo: string | null;
};

export default async function TasksPage() {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .order("due_date", { ascending: true });

  if (error) {
    return (
      <>
        <header className="border-b bg-white px-8 py-5">
          <h1 className="text-xl font-bold text-gray-900">タスク管理</h1>
        </header>

        <div className="p-8">
          <div className="rounded-xl bg-red-50 p-6 text-red-700">
            データ取得エラー：{error.message}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="border-b bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-gray-900">タスク管理</h1>
        <p className="text-sm text-gray-500">対応漏れを防止します</p>
      </header>

      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            登録件数：{tasks?.length ?? 0}件
          </p>

          <Link
            href="/tasks/new"
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-bold text-white"
          >
            ＋ タスク登録
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4">タスク名</th>
                <th className="px-6 py-4">ステータス</th>
                <th className="px-6 py-4">期限</th>
                <th className="px-6 py-4">担当者</th>
                <th className="px-6 py-4">優先度</th>
                <th className="px-6 py-4">メモ</th>
              </tr>
            </thead>

            <tbody>
              {(tasks as Task[] | null)?.map((task) => (
                <tr key={task.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-bold text-gray-900">
                    {task.title || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <TaskStatusSelect taskId={task.id} currentStatus={task.status} />
                  </td>
                  <td className="px-6 py-4">{task.due_date || "-"}</td>
                  <td className="px-6 py-4">{task.assigned_user || "-"}</td>
                  <td className="px-6 py-4">{task.priority || "中"}</td>
                  <td className="px-6 py-4">{task.memo || "-"}</td>
                </tr>
              ))}

              {tasks?.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-gray-500"
                  >
                    まだタスクが登録されていません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}