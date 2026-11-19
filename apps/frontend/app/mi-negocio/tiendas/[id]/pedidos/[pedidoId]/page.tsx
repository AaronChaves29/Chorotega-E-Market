import OrderDetail from "@/components/business/order-detail";
export default async function MyOrderPage({
  params,
}: {
  params: Promise<{ id: string; pedidoId: string }>;
}) {
  const { id, pedidoId } = await params;
  return <OrderDetail storeId={id} orderId={pedidoId} />;
}
