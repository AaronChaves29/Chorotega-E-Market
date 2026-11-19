import ProductManager from "@/components/business/product-manager";
export default async function MyProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ProductManager storeId={(await params).id} />;
}
