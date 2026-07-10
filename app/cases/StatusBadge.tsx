const statusStyles: Record<string, string> = {
  新規受付: "bg-gray-100 text-gray-700",
  内容確認中: "bg-blue-100 text-blue-700",
  見積作成中: "bg-yellow-100 text-yellow-700",
  見積提出済: "bg-purple-100 text-purple-700",
  受注: "bg-green-100 text-green-700",
  メーカー発注待ち: "bg-orange-100 text-orange-700",
  メーカー発注済: "bg-indigo-100 text-indigo-700",
  納品待ち: "bg-yellow-100 text-yellow-700",
  納品済: "bg-green-100 text-green-700",
  請求待ち: "bg-red-100 text-red-700",
  請求済: "bg-blue-100 text-blue-700",
  入金待ち: "bg-red-100 text-red-700",
  入金済: "bg-green-100 text-green-700",
  キャンセル: "bg-gray-200 text-gray-600",
};

export default function StatusBadge({ status }: { status: string | null }) {
  const label = status || "新規受付";
  const style = statusStyles[label] || "bg-gray-100 text-gray-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${style}`}>
      {label}
    </span>
  );
}