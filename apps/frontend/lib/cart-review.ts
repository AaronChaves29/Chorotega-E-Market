import { publicProduct, validId, type Cart, type CartReview } from "@/lib/cart";

export async function fetchCartReview(
  cart: Cart,
  signal?: AbortSignal,
): Promise<CartReview> {
  const response = await fetch("/api/cart/review", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      idTienda: cart.store?.idTienda,
      items: cart.items.map((i) => ({
        idProducto: i.product.idProducto,
        cantidad: i.quantity,
      })),
    }),
  });
  if (response.status === 401) {
    window.location.replace("/login?sesion=vencida");
    throw new Error("Tu sesión venció.");
  }
  if (response.status === 403) {
    window.location.replace("/cuenta");
    throw new Error("El carrito está disponible únicamente para CLIENTE.");
  }
  if (response.status === 404)
    throw new Error(
      "La tienda ya no está disponible. No se puede confirmar este carrito.",
    );
  if (!response.ok)
    throw new Error(
      "No pudimos verificar los productos. No se envió el pedido. Intentá nuevamente.",
    );
  const data = (await response.json()) as CartReview;
  if (
    !data ||
    !data.store ||
    data.store.idTienda !== cart.store?.idTienda ||
    typeof data.store.nombre !== "string" ||
    !Array.isArray(data.items) ||
    data.items.length !== cart.items.length ||
    new Set(data.items.map((i) => i.idProducto)).size !== data.items.length
  )
    throw new Error("La respuesta de disponibilidad no es válida.");
  const items = data.items.map((item) => {
    if (
      !validId(item.idProducto) ||
      !cart.items.some(
        (i) =>
          i.product.idProducto === item.idProducto &&
          i.quantity === item.quantity,
      )
    )
      throw new Error("La respuesta de disponibilidad no es válida.");
    const product =
      item.product === null
        ? null
        : publicProduct(item.product, data.store.idTienda);
    if (
      item.product !== null &&
      (!product || product.idProducto !== item.idProducto)
    )
      throw new Error("La respuesta de disponibilidad no es válida.");
    return { idProducto: item.idProducto, quantity: item.quantity, product };
  });
  return { store: data.store, items };
}
