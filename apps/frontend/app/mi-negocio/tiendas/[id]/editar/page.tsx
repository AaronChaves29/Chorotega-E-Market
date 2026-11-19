import StoreEditor from "@/components/business/store-editor";
export default async function EditMyStorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreEditor key={id} id={id} />;
}
