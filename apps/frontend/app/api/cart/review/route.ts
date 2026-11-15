import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { apiRequest } from "@/lib/api-client";
import { activeStore } from "@/lib/store-detail-api";
import { CART_LIMIT, publicProduct, validId } from "@/lib/cart";

export async function POST(request: Request) {
  const reply = (
    status: number,
    body: unknown = {
      message: "No se pudo revisar la disponibilidad del carrito.",
    },
  ) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  const identity = await getCurrentUser();
  if (identity.status !== "authenticated")
    return reply(identity.status === "unauthenticated" ? 401 : 503);
  if (identity.user.rol !== "CLIENTE") return reply(403);
  let input: {
    idTienda: number;
    items: { idProducto: number; cantidad: number }[];
  };
  try {
    input = await request.json();
    if (
      !input ||
      Object.keys(input).some((k) => !["idTienda", "items"].includes(k)) ||
      !validId(input.idTienda) ||
      !Array.isArray(input.items) ||
      input.items.length === 0 ||
      input.items.length > CART_LIMIT ||
      !input.items.every(
        (i) =>
          i &&
          typeof i === "object" &&
          Object.keys(i).every((k) => ["idProducto", "cantidad"].includes(k)) &&
          validId(i.idProducto) &&
          validId(i.cantidad),
      ) ||
      new Set(input.items.map((i) => i.idProducto)).size !== input.items.length
    )
      return reply(400);
  } catch {
    return reply(400);
  }
  try {
    const store = await activeStore(input.idTienda);
    if (store.status !== 200 || !store.store) return reply(store.status);
    const items = [];
    // Bounded batches avoid exhausting the backend pool for a full cart.
    for (let offset = 0; offset < input.items.length; offset += 5) {
      const batch = await Promise.all(
        input.items.slice(offset, offset + 5).map(async (item) => {
          const { response, data, sessionExpired } = await apiRequest<unknown>(
            `/products/${item.idProducto}`,
          );
          if (sessionExpired) throw new Error("401");
          if (response.status === 404)
            return {
              idProducto: item.idProducto,
              quantity: item.cantidad,
              product: null,
            };
          if (!response.ok) throw new Error("502");
          const p = data as {
            idProducto?: unknown;
            idTienda?: unknown;
            estado?: unknown;
          } | null;
          if (!p || p.idProducto !== item.idProducto) throw new Error("502");
          if (p.idTienda !== input.idTienda || p.estado !== "ACTIVO")
            return {
              idProducto: item.idProducto,
              quantity: item.cantidad,
              product: null,
            };
          const product = publicProduct(p, input.idTienda);
          if (!product) throw new Error("502");
          return {
            idProducto: item.idProducto,
            quantity: item.cantidad,
            product,
          };
        }),
      );
      items.push(...batch);
    }
    return reply(200, {
      store: { idTienda: store.store.idTienda, nombre: store.store.nombre },
      items,
    });
  } catch (error) {
    return reply(error instanceof Error && error.message === "401" ? 401 : 502);
  }
}
