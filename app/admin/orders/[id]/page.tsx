import OrderDetail from "../OrderDetail";

type AdminOrderDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminOrderDetailPage({
  params,
}: AdminOrderDetailPageProps) {
  const { id } = await params;

  return (
    <div className="p-4 md:p-8">
      <OrderDetail orderId={id} />
    </div>
  );
}
