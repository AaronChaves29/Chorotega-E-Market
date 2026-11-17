import ProductEditor from "@/components/business/product-editor";
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string; productoId: string }>;
}) {
  const { id, productoId } = await params;
  return <ProductEditor storeId={id} productId={productoId} />;
}
