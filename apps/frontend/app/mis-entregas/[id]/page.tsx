import DeliveryDetail from "@/components/courier/delivery-detail";
export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <DeliveryDetail id={(await params).id} />;
}
