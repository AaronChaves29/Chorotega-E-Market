"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
    const confirmationCloseButtonRef = useRef<HTMLButtonElement>(null);
    const confirmationActionButtonRef = useRef<HTMLButtonElement>(null);
    const submissionLockRef = useRef(false);

    const [selectedProducts, setSelectedProducts] = useState<
        Record<number, Product>
    >({});

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [orderCreated, setOrderCreated] = useState(false);

    const goToOrders = useCallback(() => {
        router.push("/pedidos");
        router.refresh();
    }, [router]);

    useEffect(() => {
        if (!orderCreated) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        confirmationCloseButtonRef.current?.focus();

        function handleDialogKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                goToOrders();
                return;
            }

            if (event.key !== "Tab") return;

            const closeButton = confirmationCloseButtonRef.current;
            const actionButton = confirmationActionButtonRef.current;

            if (
                event.shiftKey &&
                document.activeElement === closeButton
            ) {
                event.preventDefault();
                actionButton?.focus();
            } else if (
                !event.shiftKey &&
                document.activeElement === actionButton
            ) {
                event.preventDefault();
                closeButton?.focus();
            }
        }

        document.addEventListener("keydown", handleDialogKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleDialogKeyDown);
        };
    }, [goToOrders, orderCreated]);

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
        if (submissionLockRef.current) return;

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

        submissionLockRef.current = true;
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

            setOrderCreated(true);
        } catch (error) {
            setSubmitError(
                error instanceof Error
                    ? error.message
                    : "No se pudo confirmar el resultado. Revisá tus pedidos antes de intentarlo nuevamente.",
            );
        } finally {
            submissionLockRef.current = false;
            setSubmitting(false);
        }
    }

    return (
        <>
            <section className="create-order-section create-order-stores">
                <h2 className="create-order-section-title">
                    1. Seleccioná una tienda
                </h2>

                <p className="create-order-section-description">
                    Elegí la tienda donde querés realizar tu pedido.
                </p>

                {loading && (
                    <p className="create-order-loading">Cargando tiendas...</p>
                )}

                {error && (
                    <p role="alert" className="create-order-error">
                        {error}
                    </p>
                )}

                {!loading && !error && stores.length === 0 && (
                    <p className="create-order-empty">
                        No hay tiendas disponibles en esta página.
                    </p>
                )}

                {!loading && !error && stores.length > 0 && (
                    <div className="create-order-store-list">
                        {stores.map((store) => (
                            <label
                                key={store.idTienda}
                                className={`create-order-store-card ${
                                    selectedStoreId === String(store.idTienda)
                                        ? "is-selected"
                                        : ""
                                }`}
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
                                    className="create-order-radio"
                                />

                                <span className="create-order-store-copy">
                                    <span className="create-order-store-name">
                                        {store.nombre}
                                    </span>

                                    {store.descripcion && (
                                        <span className="create-order-store-description">
                                            {store.descripcion}
                                        </span>
                                    )}
                                </span>
                            </label>
                        ))}
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="create-order-pagination">
                        <button
                            type="button"
                            disabled={page === 0 || loading}
                            onClick={() => setPage((current) => current - 1)}
                            className="create-order-page-button"
                        >
                            Anterior
                        </button>

                        <span className="create-order-page-number">
                            Página {page + 1} de {totalPages}
                        </span>

                        <button
                            type="button"
                            disabled={page + 1 >= totalPages || loading}
                            onClick={() => setPage((current) => current + 1)}
                            className="create-order-page-button"
                        >
                            Siguiente
                        </button>
                    </div>
                )}
            </section>

            {/* SECCIÓN 2: PRODUCTOS */}
            {selectedStoreId && (
                <section className="create-order-section create-order-products">
                    <h2 className="create-order-section-title">
                        2. Seleccioná los productos
                    </h2>

                    <p className="create-order-section-description">
                        Indicá cuántas unidades querés comprar de cada producto.
                    </p>

                    {productsLoading && (
                        <p className="create-order-loading">Cargando productos...</p>
                    )}

                    {productsError && (
                        <p role="alert" className="create-order-error">
                            {productsError}
                        </p>
                    )}

                    {!productsLoading &&
                        !productsError &&
                        products.length === 0 && (
                            <p className="create-order-empty">
                                Esta tienda no tiene productos disponibles.
                            </p>
                        )}

                    {!productsLoading && !productsError && (
                        <div className="create-order-product-list">
                            {products.map((product) => (
                                <div
                                    key={product.idProducto}
                                    className="create-order-product-card"
                                >
                                    <h3 className="create-order-product-name">
                                        {product.nombre}
                                    </h3>

                                    {product.descripcion && (
                                        <p className="create-order-product-description">
                                            {product.descripcion}
                                        </p>
                                    )}

                                    <p className="create-order-product-price">
                                        Precio: ₡
                                        {Number(product.precio).toLocaleString("es-CR")}
                                    </p>

                                    <p className="create-order-stock">
                                        Disponibles: {product.cantidadDisponible}
                                    </p>

                                    <label className="create-order-quantity-label">
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
                                            className="create-order-quantity"
                                        />
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}

                    {productTotalPages > 1 && (
                        <div className="create-order-pagination">
                            <button
                                type="button"
                                disabled={productPage === 0 || productsLoading}
                                onClick={() => setProductPage((current) => current - 1)}
                                className="create-order-page-button"
                            >
                                Anterior
                            </button>

                            <span className="create-order-page-number">
                                Página {productPage + 1} de {productTotalPages}
                            </span>

                            <button
                                type="button"
                                disabled={
                                    productPage + 1 >= productTotalPages || productsLoading
                                }
                                onClick={() => setProductPage((current) => current + 1)}
                                className="create-order-page-button"
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </section>
            )}
            {selectedStoreId && (
                <section className="create-order-section create-order-delivery">
                    <h2 className="create-order-section-title">
                        3. Datos de entrega
                    </h2>

                    <p className="create-order-section-description">
                        Seleccioná el barrio e indicá la dirección donde querés recibir
                        tu pedido.
                    </p>

                    <div className="create-order-delivery-fields">
                        <div className="create-order-field">
                            <label
                                htmlFor="neighborhood"
                                className="create-order-label"
                            >
                                Barrio
                            </label>

                            {neighborhoodsLoading ? (
                                <p className="create-order-loading">Cargando barrios...</p>
                            ) : neighborhoodsError ? (
                                <p role="alert" className="create-order-error">
                                    {neighborhoodsError}
                                </p>
                            ) : (
                                <select
                                    id="neighborhood"
                                    value={selectedNeighborhoodId}
                                    onChange={(event) =>
                                        setSelectedNeighborhoodId(event.target.value)
                                    }
                                    className="create-order-input"
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

                        <div className="create-order-field">
                            <label
                                htmlFor="delivery-address"
                                className="create-order-label"
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
                                className="create-order-input create-order-textarea"
                            />

                            <p className="create-order-help">
                                Máximo 255 caracteres.
                            </p>
                        </div>
                    </div>
                </section>
            )}
            {selectedStoreId && (
                <section className="create-order-section create-order-summary">
                    <h2 className="create-order-section-title">
                        4. Resumen del pedido
                    </h2>

                    {selectedItems.length === 0 ? (
                        <p className="create-order-empty">
                            Seleccioná al menos un producto para ver el resumen.
                        </p>
                    ) : (
                        <div className="create-order-summary-items">
                            {selectedItems.map(({ product, quantity }) => (
                                <div
                                    key={product.idProducto}
                                    className="create-order-summary-item"
                                >
                                    <span>
                                        {product.nombre} × {quantity}
                                    </span>

                                    <span>
                                        {formatColones(Number(product.precio) * quantity)}
                                    </span>
                                </div>
                            ))}

                            <div className="create-order-totals">
                                <div className="create-order-total-row">
                                    <span>Subtotal estimado</span>
                                    <span>{formatColones(subtotal)}</span>
                                </div>

                                <div className="create-order-total-row">
                                    <span>Envío estimado</span>
                                    <span>
                                        {selectedNeighborhood
                                            ? formatColones(shippingFee)
                                            : "Seleccioná un barrio"}
                                    </span>
                                </div>

                                <div className="create-order-total-row create-order-grand-total">
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

                    <p className="create-order-disclaimer">
                        Al confirmar, revisaremos los precios y la disponibilidad y
                        actualizaremos el total de tu pedido.
                    </p>

                    {submitError && (
                        <p role="alert" className="create-order-error">
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
                        className="create-order-confirm"
                    >
                        {submitting ? "Confirmando pedido..." : "Confirmar pedido"}
                    </button>
                </section>
            )}
            {orderCreated && (
                <div className="create-order-dialog-backdrop">
                    <section
                        aria-labelledby="create-order-success-title"
                        aria-describedby="create-order-success-message"
                        aria-modal="true"
                        className="create-order-success-dialog"
                        role="dialog"
                    >
                        <button
                            aria-label="Cerrar confirmación y ver mis pedidos"
                            className="create-order-dialog-close"
                            onClick={goToOrders}
                            ref={confirmationCloseButtonRef}
                            type="button"
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                        <div aria-hidden="true" className="create-order-success-icon">
                            <svg
                                fill="none"
                                viewBox="0 0 32 32"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="m8 16.5 5.2 5.2L24.5 10"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2.8"
                                />
                            </svg>
                        </div>
                        <h2 id="create-order-success-title">
                            ¡Tu pedido se creó con éxito!
                        </h2>
                        <p id="create-order-success-message">
                            Gracias por apoyar los emprendimientos locales. Podés consultar
                            el estado de tu pedido en cualquier momento.
                        </p>
                        <button
                            className="create-order-success-action"
                            onClick={goToOrders}
                            ref={confirmationActionButtonRef}
                            type="button"
                        >
                            Ver mis pedidos
                        </button>
                    </section>
                </div>
            )}
        </>
    );
}