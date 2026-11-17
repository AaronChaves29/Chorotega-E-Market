import ProductEditor from "@/components/business/product-editor";
export default async function NewProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ProductEditor storeId={(await params).id} />;
}
