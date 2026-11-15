import type { StoreProduct } from "@/lib/store-detail";

export const CART_KEY = "chorotega.cart.v1";
export const CART_LIMIT = 50;
export type CartItem = { product: StoreProduct; quantity: number };
export type Cart = {
  scope: string;
  store: { idTienda: number; nombre: string } | null;
  items: CartItem[];
  phase: "editing" | "submitting" | "uncertain" | "created";
  orderId?: number;
};
export type CartReview = {
  store: { idTienda: number; nombre: string };
  items: {
    idProducto: number;
    quantity: number;
    product: StoreProduct | null;
  }[];
};

export function cents(value: string): bigint {
  if (!/^\d{1,12}\.\d{2}$/.test(value)) throw new Error("Importe inválido");
  return BigInt(value.replace(".", ""));
}
export function colones(value: bigint): string {
  const whole = value / BigInt(100),
    fraction = String(value % BigInt(100)).padStart(2, "0");
  return `₡${whole.toLocaleString("es-CR")},${fraction}`;
}
export function subtotal(items: CartItem[]): bigint {
  return items.reduce(
    (sum, item) => sum + cents(item.product.precio) * BigInt(item.quantity),
    BigInt(0),
  );
}
export function validId(value: unknown): value is number {
  return (
    Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 2147483647
  );
}
export function validQuantity(value: unknown, stock: number): value is number {
  return validId(value) && Number(value) <= stock;
}
export function emptyCart(scope: string): Cart {
  return { scope, store: null, items: [], phase: "editing" };
}
export function publicProduct(
  value: unknown,
  storeId: number,
): StoreProduct | null {
  if (!value || typeof value !== "object") return null;
  const p = value as StoreProduct;
  if (
    !validId(p.idProducto) ||
    p.idTienda !== storeId ||
    typeof p.nombre !== "string" ||
    p.nombre.length > 150 ||
    !(p.descripcion === null || typeof p.descripcion === "string") ||
    typeof p.precio !== "string" ||
    !/^\d{1,8}\.\d{2}$/.test(p.precio) ||
    cents(p.precio) <= BigInt(0) ||
    !Number.isInteger(p.cantidadDisponible) ||
    p.cantidadDisponible < 0 ||
    p.cantidadDisponible > 2147483647 ||
    p.estado !== "ACTIVO"
  )
    return null;
  // Select fields rather than retaining untrusted relations or storage extras.
  return {
    idProducto: p.idProducto,
    idTienda: p.idTienda,
    nombre: p.nombre,
    descripcion: null,
    precio: p.precio,
    cantidadDisponible: p.cantidadDisponible,
    estado: p.estado,
  };
}
export function readCart(raw: string | null, scope: string): Cart {
  try {
    if (!raw || raw.length > 100000) return emptyCart(scope);
    const c = JSON.parse(raw) as Cart;
    if (
      c.scope !== scope ||
      !["editing", "submitting", "uncertain", "created"].includes(c.phase) ||
      !Array.isArray(c.items) ||
      c.items.length > CART_LIMIT
    )
      return emptyCart(scope);
    if (c.phase === "created")
      return validId(c.orderId)
        ? { ...emptyCart(scope), phase: "created", orderId: c.orderId }
        : emptyCart(scope);
    if (c.items.length === 0) return emptyCart(scope);
    if (
      !c.store ||
      !validId(c.store.idTienda) ||
      typeof c.store.nombre !== "string" ||
      c.store.nombre.length > 150
    )
      return emptyCart(scope);
    const items: CartItem[] = [];
    for (const item of c.items) {
      const product = publicProduct(item.product, c.store.idTienda);
      if (
        !product ||
        !validQuantity(item.quantity, product.cantidadDisponible) ||
        items.some((i) => i.product.idProducto === product.idProducto)
      )
        return emptyCart(scope);
      items.push({ product, quantity: item.quantity });
    }
    return {
      scope,
      store: { idTienda: c.store.idTienda, nombre: c.store.nombre },
      items,
      phase: c.phase === "submitting" ? "uncertain" : c.phase,
    };
  } catch {
    return emptyCart(scope);
  }
}
export function addItem(
  cart: Cart,
  store: NonNullable<Cart["store"]>,
  product: StoreProduct,
  quantity: number,
  replace = false,
): Cart {
  if (cart.phase !== "editing" && cart.phase !== "created")
    throw new Error("Revisá tus pedidos antes de modificar este carrito.");
  const selected = publicProduct(product, store.idTienda);
  if (!selected || !validQuantity(quantity, selected.cantidadDisponible))
    throw new Error("Revisá la cantidad y las existencias.");
  const different =
    cart.items.length > 0 && cart.store?.idTienda !== store.idTienda;
  if (different && !replace)
    throw new Error("El carrito pertenece a otro emprendimiento.");
  const items = different || cart.phase === "created" ? [] : cart.items;
  const previous = items.find(
    (i) => i.product.idProducto === selected.idProducto,
  );
  const total = quantity + (previous?.quantity ?? 0);
  if (!validQuantity(total, selected.cantidadDisponible))
    throw new Error("La cantidad acumulada supera las existencias.");
  if (!previous && items.length >= CART_LIMIT)
    throw new Error(
      `El carrito admite hasta ${CART_LIMIT} productos diferentes.`,
    );
  return {
    scope: cart.scope,
    store: { idTienda: store.idTienda, nombre: store.nombre },
    phase: "editing",
    items: [
      ...items.filter((i) => i.product.idProducto !== selected.idProducto),
      { product: selected, quantity: total },
    ],
  };
}
export function reviewChanges(cart: Cart, review: CartReview): string[] {
  if (
    cart.store?.idTienda !== review.store.idTienda ||
    review.items.length !== cart.items.length
  )
    throw new Error("Revisión incompleta");
  return cart.items.flatMap((item) => {
    const row = review.items.find(
      (r) => r.idProducto === item.product.idProducto,
    );
    if (!row || row.quantity !== item.quantity)
      throw new Error("Revisión incompleta");
    if (!row.product || row.product.cantidadDisponible === 0)
      return [
        `${item.product.nombre}: ya no está disponible; se retirará al aplicar los cambios.`,
      ];
    const changes: string[] = [];
    if (row.product.precio !== item.product.precio)
      changes.push(
        `${item.product.nombre}: precio ${colones(cents(item.product.precio))} → ${colones(cents(row.product.precio))}.`,
      );
    if (row.product.cantidadDisponible !== item.product.cantidadDisponible)
      changes.push(
        `${item.product.nombre}: existencias ${item.product.cantidadDisponible} → ${row.product.cantidadDisponible}${item.quantity > row.product.cantidadDisponible ? `; cantidad ${item.quantity} → ${row.product.cantidadDisponible}` : ""}.`,
      );
    return changes;
  });
}
export function applyReview(cart: Cart, review: CartReview): Cart {
  reviewChanges(cart, review);
  const items = review.items.flatMap((row) =>
    row.product && row.product.cantidadDisponible > 0
      ? [
          {
            product: row.product,
            quantity: Math.min(row.quantity, row.product.cantidadDisponible),
          },
        ]
      : [],
  );
  return { ...cart, store: items.length ? review.store : null, items };
}
export function clearStoredCart() {
  try {
    sessionStorage.removeItem(CART_KEY);
  } catch {
    /* Memory is invalidated too. */
  }
  window.dispatchEvent(new Event("chorotega-cart-clear"));
}
