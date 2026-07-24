import OrdersList from "./OrdersList";

export default function AdminOrdersPage() {
  return (
    <>
      <header className="border-b bg-white px-4 py-5 md:px-8">
        <h1 className="text-xl font-bold text-gray-900">受注管理</h1>
        <p className="mt-1 text-sm text-gray-500">
          販売店から届いた発注依頼を確認できます
        </p>
      </header>

      <div className="p-4 md:p-8">
        <OrdersList />
      </div>
    </>
  );
}
