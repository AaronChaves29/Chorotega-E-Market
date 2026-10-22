"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
    CreateOrderRequest,
    Neighborhood,
    PaginatedResponse,
    Product,
    Store,
} from "@/types/catalog";

export default function CreateOrderForm() {
    const [stores, setStores] = useState<Store[]>([]);
    const [selectedStoreId, setSelectedStoreId] = useState("");
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [products, setProducts] = useState<Product[]>([]);
    const [productPage, setProductPage] = useState(0);
    const [productTotalPages, setProductTotalPages] = useState(0);
    const [productsLoading, setProductsLoading] = useState(false);
    const [productsError, setProductsError] = useState("");
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
    const [neighborhoodsLoading, setNeighborhoodsLoading] = useState(true);
    const [neighborhoodsError, setNeighborhoodsError] = useState("");
    const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState("");
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const router = useRouter();

    const [selectedProducts, setSelectedProducts] = useState<
        Record<number, Product>
    >({});

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        async function loadStores() {
            setLoading(true);
            setError("");

            try {
                const response = await fetch(`/api/stores?page=${page}`, {
                    signal: controller.signal,
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error("No fue posible cargar las tiendas.");
                }

                const data =
                    (await response.json()) as PaginatedResponse<Store>;

                setStores(data.content);
                setTotalPages(data.totalPages);
            } catch (err) {
                if (controller.signal.aborted) return;

                setError(
                    err instanceof Error
                        ? err.message
                        : "Ocurrió un error al consultar las tiendas.",
                );
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        void loadStores();

        return () => controller.abort();
    }, [page]);

    useEffect(() => {
        if (!selectedStoreId) return;

        const controller = new AbortController();

        async function loadProducts() {
            setProductsLoading(true);
            setProductsError("");
            setProducts([]);

            try {
                const response = await fetch(
                    `/api/products?idTienda=${selectedStoreId}&page=${productPage}`,
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    },
                );

                if (!response.ok) {
                    throw new Error("No fue posible cargar los productos.");
                }

                const data =
                    (await response.json()) as PaginatedResponse<Product>;

                setProducts(data.content);
                setProductTotalPages(data.totalPages);
            } catch (err) {
                if (controller.signal.aborted) return;

                setProductsError(
                    err instanceof Error
                        ? err.message
                        : "Ocurrió un error al consultar los productos.",
                );
            } finally {
                if (!controller.signal.aborted) {
                    setProductsLoading(false);
                }
            }
        }

        void loadProducts();

        return () => controller.abort();
    }, [selectedStoreId, productPage]);

    useEffect(() => {
        const controller = new AbortController();

        async function loadNeighborhoods() {
            setNeighborhoodsLoading(true);
            setNeighborhoodsError("");

            try {
                const response = await fetch("/api/neighborhoods", {
                    signal: controller.signal,
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error("No fue posible cargar los barrios.");
                }

                const data = (await response.json()) as Neighborhood[];

                setNeighborhoods(data);
            } catch (err) {
                if (controller.signal.aborted) return;

                setNeighborhoodsError(
                    err instanceof Error
                        ? err.message
                        : "Ocurrió un error al consultar los barrios.",
                );
            } finally {
                if (!controller.signal.aborted) {
                    setNeighborhoodsLoading(false);
                }
            }
        }

        void loadNeighborhoods();

        return () => controller.abort();
    }, []);

    const selectedItems = Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([productId, quantity]) => ({
            product: selectedProducts[Number(productId)],
            quantity,
        }))
        .filter(
            (item): item is { product: Product; quantity: number } =>
                item.product !== undefined,
        );

    const selectedNeighborhood = neighborhoods.find(
        (neighborhood) =>
            String(neighborhood.idBarrio) === selectedNeighborhoodId,
    );

    const subtotal = selectedItems.reduce(
        (total, item) =>
            total + Number(item.product.precio) * item.quantity,
        0,
    );

    const shippingFee = selectedNeighborhood
        ? Number(selectedNeighborhood.tarifaEnvio)
        : 0;

    const estimatedTotal = subtotal + shippingFee;

    const formatColones = (value: number) =>
        `₡${value.toLocaleString("es-CR")}`;

    async function handleCreateOrder() {
        if (submitting) return;

        setSubmitError("");

        if (!selectedStoreId) {
            setSubmitError("Seleccioná una tienda.");
            return;
        }

        if (selectedItems.length === 0) {
            setSubmitError("Seleccioná al menos un producto.");
            return;
        }

        if (!selectedNeighborhood) {
            setSubmitError("Seleccioná un barrio.");
            return;
        }

        if (!deliveryAddress.trim()) {
            setSubmitError("Ingresá la dirección de entrega.");
            return;
        }

        if (deliveryAddress.length > 255) {
            setSubmitError("La dirección no puede superar los 255 caracteres.");
            return;
        }

        const body: CreateOrderRequest = {
            idBarrio: selectedNeighborhood.idBarrio,
            direccionEntrega: deliveryAddress.trim(),
            items: selectedItems.map(({ product, quantity }) => ({
                idProducto: product.idProducto,
                cantidad: quantity,
            })),
        };

        setSubmitting(true);

        try {
            const response = await fetch("/api/orders", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            if (response.status === 401) {
                router.replace("/login");
                return;
            }

            if (!response.ok) {
                const data: unknown = await response.json().catch(() => null);

                let message = "No fue posible crear el pedido.";

                if (data && typeof data === "object" && "message" in data) {
                    const serverMessage = data.message;

                    if (typeof serverMessage === "string") {
                        message = serverMessage;
                    } else if (Array.isArray(serverMessage)) {
                        message = serverMessage
                            .filter((item): item is string => typeof item === "string")
                            .join(". ");
                    }
                }

                throw new Error(message);
            }

            router.push("/pedidos");
            router.refresh();
        } catch (error) {
            setSubmitError(
                error instanceof Error
                    ? error.message
                    : "No se pudo confirmar el resultado. Revisá tus pedidos antes de intentarlo nuevamente.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <section className="mt-8 rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-semibold">
                    1. Seleccioná una tienda
                </h2>

                <p className="mt-2 text-sm text-gray-600">
                    Elegí la tienda donde querés realizar tu pedido.
                </p>

                {loading && (
                    <p className="mt-4 text-sm">Cargando tiendas...</p>
                )}

                {error && (
                    <p role="alert" className="mt-4 text-sm text-red-600">
                        {error}
                    </p>
                )}

                {!loading && !error && stores.length === 0 && (
                    <p className="mt-4 text-sm text-gray-600">
                        No hay tiendas disponibles en esta página.
                    </p>
                )}

                {!loading && !error && stores.length > 0 && (
                    <div className="mt-4 space-y-3">
                        {stores.map((store) => (
                            <label
                                key={store.idTienda}
                                className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4"
                            >
                                <input
                                    type="radio"
                                    name="store"
                                    value={store.idTienda}
                                    checked={selectedStoreId === String(store.idTienda)}
                                    onChange={() => {
                                        setSelectedStoreId(String(store.idTienda));
                                        setProductPage(0);
                                        setProducts([]);
                                        setProductTotalPages(0);
                                        setQuantities({});
                                        setSelectedProducts({});
                                        setSubmitError("");
                                    }}
                                    className="mt-1"
                                />

                                <span>
                                    <span className="block font-medium">
                                        {store.nombre}
                                    </span>

                                    {store.descripcion && (
                                        <span className="mt-1 block text-sm text-gray-600">
                                            {store.descripcion}
                                        </span>
                                    )}
                                </span>
                            </label>
                        ))}
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between">
                        <button
                            type="button"
                            disabled={page === 0 || loading}
                            onClick={() => setPage((current) => current - 1)}
                            className="rounded border px-4 py-2 disabled:opacity-50"
                        >
                            Anterior
                        </button>

                        <span className="text-sm">
                            Página {page + 1} de {totalPages}
                        </span>

                        <button
                            type="button"
                            disabled={page + 1 >= totalPages || loading}
                            onClick={() => setPage((current) => current + 1)}
                            className="rounded border px-4 py-2 disabled:opacity-50"
                        >
                            Siguiente
                        </button>
                    </div>
                )}
            </section>

            {/* SECCIÓN 2: PRODUCTOS */}
            {selectedStoreId && (
                <section className="mt-6 rounded-lg border border-gray-200 p-6">
                    <h2 className="text-xl font-semibold">
                        2. Seleccioná los productos
                    </h2>

                    <p className="mt-2 text-sm text-gray-600">
                        Indicá cuántas unidades querés comprar de cada producto.
                    </p>

                    {productsLoading && (
                        <p className="mt-4">Cargando productos...</p>
                    )}

                    {productsError && (
                        <p role="alert" className="mt-4 text-red-600">
                            {productsError}
                        </p>
                    )}

                    {!productsLoading &&
                        !productsError &&
                        products.length === 0 && (
                            <p className="mt-4 text-gray-600">
                                Esta tienda no tiene productos disponibles.
                            </p>
                        )}

                    {!productsLoading && !productsError && (
                        <div className="mt-4 space-y-4">
                            {products.map((product) => (
                                <div
                                    key={product.idProducto}
                                    className="rounded-lg border border-gray-200 p-4"
                                >
                                    <h3 className="font-semibold">
                                        {product.nombre}
                                    </h3>

                                    {product.descripcion && (
                                        <p className="mt-1 text-sm text-gray-600">
                                            {product.descripcion}
                                        </p>
                                    )}

                                    <p className="mt-2 text-sm">
                                        Precio: ₡
                                        {Number(product.precio).toLocaleString("es-CR")}
                                    </p>

                                    <p className="text-sm">
                                        Disponibles: {product.cantidadDisponible}
                                    </p>

                                    <label className="mt-3 block text-sm">
                                        Cantidad
                                        <input
                                            type="number"
                                            min="0"
                                            max={product.cantidadDisponible}
                                            value={quantities[product.idProducto] ?? 0}
                                            onChange={(event) => {
                                                const value = Number(event.target.value);

                                                if (
                                                    !Number.isInteger(value) ||
                                                    value < 0 ||
                                                    value > product.cantidadDisponible
                                                ) {
                                                    return;
                                                }

                                                setQuantities((current) => ({
                                                    ...current,
                                                    [product.idProducto]: value,
                                                }));
                                                setSelectedProducts((current) => {
                                                    const updated = { ...current };

                                                    if (value === 0) {
                                                        delete updated[product.idProducto];
                                                    } else {
                                                        updated[product.idProducto] = product;
                                                    }

                                                    return updated;
                                                });

                                                setSubmitError("");
                                            }}
                                            className="mt-1 block w-28 rounded border px-3 py-2"
                                        />
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}

                    {productTotalPages > 1 && (
                        <div className="mt-6 flex items-center justify-between">
                            <button
                                type="button"
                                disabled={productPage === 0 || productsLoading}
                                onClick={() => setProductPage((current) => current - 1)}
                                className="rounded border px-4 py-2 disabled:opacity-50"
                            >
                                Anterior
                            </button>

                            <span className="text-sm">
                                Página {productPage + 1} de {productTotalPages}
                            </span>

                            <button
                                type="button"
                                disabled={
                                    productPage + 1 >= productTotalPages || productsLoading
                                }
                                onClick={() => setProductPage((current) => current + 1)}
                                className="rounded border px-4 py-2 disabled:opacity-50"
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </section>
            )}
            {selectedStoreId && (
                <section className="mt-6 rounded-lg border border-gray-200 p-6">
                    <h2 className="text-xl font-semibold">
                        3. Datos de entrega
                    </h2>

                    <p className="mt-2 text-sm text-gray-600">
                        Seleccioná el barrio e indicá la dirección donde querés recibir
                        tu pedido.
                    </p>

                    <div className="mt-5 space-y-5">
                        <div>
                            <label
                                htmlFor="neighborhood"
                                className="block text-sm font-medium"
                            >
                                Barrio
                            </label>

                            {neighborhoodsLoading ? (
                                <p className="mt-2 text-sm">Cargando barrios...</p>
                            ) : neighborhoodsError ? (
                                <p role="alert" className="mt-2 text-sm text-red-600">
                                    {neighborhoodsError}
                                </p>
                            ) : (
                                <select
                                    id="neighborhood"
                                    value={selectedNeighborhoodId}
                                    onChange={(event) =>
                                        setSelectedNeighborhoodId(event.target.value)
                                    }
                                    className="mt-2 w-full rounded border border-gray-300 bg-transparent px-3 py-2"
                                >
                                    <option value="">Seleccioná un barrio</option>

                                    {neighborhoods.map((neighborhood) => (
                                        <option
                                            key={neighborhood.idBarrio}
                                            value={neighborhood.idBarrio}
                                        >
                                            {neighborhood.nombre} — Envío: ₡
                                            {Number(neighborhood.tarifaEnvio).toLocaleString("es-CR")}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="delivery-address"
                                className="block text-sm font-medium"
                            >
                                Dirección de entrega
                            </label>

                            <textarea
                                id="delivery-address"
                                value={deliveryAddress}
                                onChange={(event) =>
                                    setDeliveryAddress(event.target.value)
                                }
                                maxLength={255}
                                rows={3}
                                placeholder="Ejemplo: Casa azul, 100 metros al norte de la escuela"
                                className="mt-2 w-full rounded border border-gray-300 bg-transparent px-3 py-2"
                            />

                            <p className="mt-1 text-xs text-gray-500">
                                Máximo 255 caracteres.
                            </p>
                        </div>
                    </div>
                </section>
            )}
            {selectedStoreId && (
                <section className="mt-6 rounded-lg border border-gray-200 p-6">
                    <h2 className="text-xl font-semibold">
                        4. Resumen del pedido
                    </h2>

                    {selectedItems.length === 0 ? (
                        <p className="mt-4 text-sm text-gray-600">
                            Seleccioná al menos un producto para ver el resumen.
                        </p>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {selectedItems.map(({ product, quantity }) => (
                                <div
                                    key={product.idProducto}
                                    className="flex justify-between gap-4 text-sm"
                                >
                                    <span>
                                        {product.nombre} × {quantity}
                                    </span>

                                    <span>
                                        {formatColones(Number(product.precio) * quantity)}
                                    </span>
                                </div>
                            ))}

                            <div className="border-t border-gray-200 pt-4">
                                <div className="flex justify-between text-sm">
                                    <span>Subtotal estimado</span>
                                    <span>{formatColones(subtotal)}</span>
                                </div>

                                <div className="mt-2 flex justify-between text-sm">
                                    <span>Envío estimado</span>
                                    <span>
                                        {selectedNeighborhood
                                            ? formatColones(shippingFee)
                                            : "Seleccioná un barrio"}
                                    </span>
                                </div>

                                <div className="mt-4 flex justify-between font-semibold">
                                    <span>Total estimado</span>
                                    <span>
                                        {selectedNeighborhood
                                            ? formatColones(estimatedTotal)
                                            : "Pendiente"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <p className="mt-4 text-xs text-gray-500">
                        Los precios y las existencias se verificarán al confirmar el pedido.
                        El backend calculará el total definitivo.
                    </p>

                    {submitError && (
                        <p role="alert" className="mt-4 text-sm text-red-600">
                            {submitError}
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={() => void handleCreateOrder()}
                        disabled={
                            submitting ||
                            selectedItems.length === 0 ||
                            !selectedNeighborhood ||
                            !deliveryAddress.trim() ||
                            deliveryAddress.length > 255
                        }
                        className="mt-6 w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {submitting ? "Confirmando pedido..." : "Confirmar pedido"}
                    </button>
                </section>
            )}
        </>
    );
}