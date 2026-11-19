"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CurrentUser } from "@/types/auth";
import { CART_KEY, readCart, type Cart } from "@/lib/cart";

type CartContext = {
  status: "loading" | "ready" | "error" | "forbidden";
  cart: Cart | null;
  error: string;
  update: (change: (cart: Cart) => Cart) => void;
  verify: () => Promise<boolean>;
};
const Context = createContext<CartContext | null>(null);

export function CartProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: ReactNode;
}) {
  const current = useRef<Cart | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const alive = useRef(true);
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<CartContext["status"]>(
    user.rol === "CLIENTE" ? "loading" : "forbidden",
  );

  const verify = useCallback((): Promise<boolean> => {
    if (user.rol !== "CLIENTE") return Promise.resolve(false);
    if (pending.current) return pending.current;
    const task = (async () => {
      setStatus("loading");
      try {
        const response = await fetch("/api/cart/session", {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        if ([401, 403].includes(response.status)) {
          sessionStorage.removeItem(CART_KEY);
          current.current = null;
          setCart(null);
          window.location.replace(
            response.status === 401 ? "/login?sesion=vencida" : "/cuenta",
          );
          return false;
        }
        if (!response.ok) throw new Error("Sesión no disponible");
        const identity = await response.json();
        if (identity.userId !== user.idUsuario) {
          sessionStorage.removeItem(CART_KEY);
          window.location.replace("/acceso");
          return false;
        }
        if (
          typeof identity.scope !== "string" ||
          !/^[a-f0-9]{64}$/.test(identity.scope)
        )
          throw new Error("Sesión no disponible");
        if (!alive.current) return false;
        const restored = readCart(
          sessionStorage.getItem(CART_KEY),
          identity.scope,
        );
        sessionStorage.setItem(CART_KEY, JSON.stringify(restored));
        current.current = restored;
        setCart(restored);
        setError("");
        setStatus("ready");
        return true;
      } catch {
        if (alive.current) {
          setError(
            "No pudimos habilitar el carrito. Verificá tu conexión y que el navegador permita sessionStorage.",
          );
          setStatus("error");
        }
        return false;
      } finally {
        pending.current = null;
      }
    })();
    pending.current = task;
    return task;
  }, [user.idUsuario, user.rol]);

  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => void verify(), 0);
    function visible() {
      if (document.visibilityState === "visible") void verify();
    }
    function clear() {
      current.current = null;
      setCart(null);
      setStatus("loading");
    }
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("chorotega-cart-clear", clear);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("chorotega-cart-clear", clear);
    };
  }, [verify]);

  function update(change: (cart: Cart) => Cart) {
    if (status !== "ready" || !current.current)
      throw new Error("Esperá a verificar la sesión del carrito.");
    const next = change(current.current);
    if (next.scope !== current.current.scope)
      throw new Error("Sesión del carrito inválida.");
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(next));
    } catch {
      throw new Error(
        "No se pudo conservar el carrito. No se envió la compra.",
      );
    }
    current.current = next;
    setCart(next);
  }
  return (
    <Context.Provider value={{ status, cart, error, update, verify }}>
      {children}
    </Context.Provider>
  );
}

export function useCart() {
  const context = useContext(Context);
  if (!context) throw new Error("Carrito fuera de su sesión");
  return context;
}
