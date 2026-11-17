import OrderManager from "@/components/business/order-manager";
export default async function MyOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderManager key={id} storeId={id} />;
}
