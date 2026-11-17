"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useBusinessData } from "@/hooks/use-business-data";
import {
  productFormValues,
  productFormBody,
  productStates,
  type ManagedProduct,
  type ManagedCategory,
  type ProductErrors,
  type ProductValues,
} from "@/lib/managed-products";
import { productPrice } from "@/lib/store-detail";
import type { Store } from "@/types/catalog";
import styles from "./business.module.css";
import productStyles from "./products.module.css";

function ProductForm({
  store,
  product,
  categories,
}: {
  store: Store;
  product?: ManagedProduct;
  categories: ManagedCategory[];
}) {
  const [original, setOriginal] = useState(product);
  const [values, setValues] = useState(() => productFormValues(product));
  const [errors, setErrors] = useState<ProductErrors>({});
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false),
    [pending, setPending] = useState(false);
  const [created, setCreated] = useState<ManagedProduct>();
  const [gate, setGate] = useState<"conflict" | "uncertain" | null>(null);
  const [candidate, setCandidate] = useState<ManagedProduct>();
  const [reading, setReading] = useState(false),
    [readError, setReadError] = useState("");
  const submitting = useRef(false);
  const root = `/mi-negocio/tiendas/${store.idTienda}/productos`;
  const api = `/api${root}`;
  const activeCategories = categories.filter((c) => c.estado === "ACTIVA");
  const categoryName = (id: number) =>
    categories.find((c) => c.idCategoria === id)?.nombre ?? `Categoría #${id}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || gate) return;
    const form = event.currentTarget;
    const payload = productFormBody(values, original);
    setErrors(payload.errors);
    setMessage("");
    setSaved(false);
    if (Object.keys(payload.errors).length) {
      const first = Object.keys(payload.errors)[0];
      (form.elements.namedItem(first) as HTMLInputElement | null)?.focus();
      return;
    }
    if (!payload.changed) {
      setMessage("No hay cambios para guardar.");
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch(
        original ? `${api}/${original.idProducto}` : api,
        {
          method: original ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.body),
          cache: "no-store",
        },
      );
      if (response.status === 401) {
        window.location.replace("/login?sesion=vencida");
        return;
      }
      if (response.status === 409 && original) {
        setGate("conflict");
        setCandidate(undefined);
        setMessage(
          "Este producto cambió desde que lo abriste. Conservamos tus valores; consultá la versión vigente antes de decidir.",
        );
        return;
      }
      if (!response.ok) {
        if (response.status >= 500) {
          setGate("uncertain");
          setMessage(
            original
              ? "No pudimos confirmar los cambios. Consultá la versión vigente antes de continuar."
              : "No pudimos confirmar si el producto se creó. Revisá el listado antes de intentar nuevamente.",
          );
        } else {
          setMessage(
            response.status === 404
              ? "La tienda, producto o categoría ya no está disponible. Conservamos tus valores."
              : "El servidor rechazó la solicitud. Revisá los campos; conservamos tus valores.",
          );
          if (response.status === 400) {
            const data = (await response.json().catch(() => null)) as {
              errors?: ProductErrors;
            } | null;
            if (data?.errors)
              setErrors(
                Object.fromEntries(
                  Object.keys(payload.body)
                    .filter((k) => k in data.errors!)
                    .map((k) => [
                      k,
                      "Revisá este campo según las opciones y límites indicados.",
                    ]),
                ),
              );
          }
        }
        return;
      }
      const updated = (await response.json()) as ManagedProduct;
      if (!original) setCreated(updated);
      else {
        setOriginal(updated);
        setValues(productFormValues(updated));
        setSaved(true);
        setMessage("Cambios guardados correctamente.");
      }
    } catch {
      setGate("uncertain");
      setMessage(
        original
          ? "No pudimos confirmar los cambios. Conservamos tus valores; consultá la versión vigente."
          : "No pudimos confirmar si el producto se creó. Conservamos el formulario; revisá el listado antes de intentar nuevamente.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  async function readCurrent() {
    if (!original || reading) return;
    setReading(true);
    setReadError("");
    try {
      const response = await fetch(`${api}/${original.idProducto}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.replace("/login?sesion=vencida");
        return;
      }
      if (!response.ok) throw new Error("read_failed");
      const data = (await response.json()) as { product: ManagedProduct };
      setCandidate(data.product);
    } catch {
      setReadError(
        "No pudimos consultar la versión vigente. Tus valores no se modificaron.",
      );
    } finally {
      setReading(false);
    }
  }
  if (created)
    return (
      <section
        className={styles.panel}
        role="status"
        data-product-created={created.idProducto}
      >
        <h2>Producto creado correctamente</h2>
        <p>
          {created.nombre} quedó registrado en {store.nombre}.
        </p>
        <div className={styles.actions}>
          <Link className={styles.button} href={root}>
            Volver al listado
          </Link>
          <Link
            className={styles.secondary}
            href={`${root}/${created.idProducto}/editar`}
          >
            Editar producto
          </Link>
        </div>
      </section>
    );
  const currentCategory = original
    ? categories.find((c) => c.idCategoria === original.idCategoria)
    : undefined;
  function input(
    field: keyof ProductValues,
    label: string,
    max: number,
    mode?: "decimal" | "numeric",
  ) {
    return (
      <div className={styles.field}>
        <label htmlFor={`product-${field}`}>{label} *</label>
        <input
          id={`product-${field}`}
          name={field}
          value={values[field]}
          onChange={(e) =>
            setValues((v) => ({ ...v, [field]: e.target.value }))
          }
          maxLength={max}
          inputMode={mode}
          required
          aria-invalid={!!errors[field]}
          aria-describedby={
            errors[field] ? `product-${field}-error` : undefined
          }
        />
        {errors[field] ? (
          <p
            className={styles.error}
            role="alert"
            id={`product-${field}-error`}
          >
            {errors[field]}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <form
        className={styles.panel}
        aria-label={original ? "Editar producto" : "Crear producto"}
        onSubmit={submit}
        noValidate
      >
        <h2>{original ? "Editar producto" : "Agregar producto"}</h2>
        <p>Tienda: {store.nombre}</p>
        {original ? (
          <p data-product-version={original.version}>
            Versión cargada: {original.version}
          </p>
        ) : null}
        <p className={styles.help}>
          Los campos con * son obligatorios. La tienda permanece fija. No se
          cargan fotografías en esta fase.
        </p>
        <fieldset className={styles.fields} disabled={pending}>
          <legend className={styles.legend}>Información comercial</legend>
          {input("nombre", "Nombre", 150)}
          <div className={styles.field}>
            <label htmlFor="product-idCategoria">Categoría *</label>
            <select
              id="product-idCategoria"
              name="idCategoria"
              value={values.idCategoria}
              onChange={(e) =>
                setValues((v) => ({ ...v, idCategoria: e.target.value }))
              }
              required
              aria-invalid={!!errors.idCategoria}
              aria-describedby={`product-category-help${errors.idCategoria ? " product-category-error" : ""}`}
            >
              <option value="">Seleccioná una categoría</option>
              {original &&
              (!currentCategory || currentCategory.estado === "INACTIVA") ? (
                <option value={original.idCategoria} disabled>
                  {categoryName(original.idCategoria)} (asignada, inactiva o no
                  disponible)
                </option>
              ) : null}
              {activeCategories.map((c) => (
                <option key={c.idCategoria} value={c.idCategoria}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <p id="product-category-help" className={styles.help}>
              Nuevas selecciones: solo categorías activas. Podés conservar la
              categoría inactiva ya asignada.
            </p>
            {errors.idCategoria ? (
              <p
                role="alert"
                id="product-category-error"
                className={styles.error}
              >
                {errors.idCategoria}
              </p>
            ) : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="product-descripcion">Descripción (opcional)</label>
            <textarea
              id="product-descripcion"
              name="descripcion"
              value={values.descripcion}
              onChange={(e) =>
                setValues((v) => ({ ...v, descripcion: e.target.value }))
              }
              maxLength={500}
              rows={4}
              aria-invalid={!!errors.descripcion}
              aria-describedby={
                errors.descripcion ? "product-descripcion-error" : undefined
              }
            />
            <p className={styles.help}>
              Hasta 500 caracteres. Vaciar elimina la descripción.
            </p>
            {errors.descripcion ? (
              <p
                role="alert"
                id="product-descripcion-error"
                className={styles.error}
              >
                {errors.descripcion}
              </p>
            ) : null}
          </div>
          {input("precio", "Precio en colones", 11, "decimal")}
          {input("cantidadDisponible", "Existencias", 10, "numeric")}
          <div className={styles.field}>
            <label htmlFor="product-estado">Estado *</label>
            <select
              id="product-estado"
              name="estado"
              required
              aria-invalid={!!errors.estado}
              aria-describedby={
                errors.estado ? "product-estado-error" : undefined
              }
              value={values.estado}
              onChange={(e) =>
                setValues((v) => ({ ...v, estado: e.target.value }))
              }
            >
              {productStates.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {errors.estado ? (
              <p
                role="alert"
                id="product-estado-error"
                className={styles.error}
              >
                {errors.estado}
              </p>
            ) : null}
          </div>
        </fieldset>
        <p className={styles.help}>
          Precio: entre 0,01 y 99.999.999,99; hasta dos decimales con coma o
          punto y sin separadores de miles. Existencias: entero no negativo. No
          se cambia el estado automáticamente al modificar stock.
        </p>
        {!original && !activeCategories.length ? (
          <p className={styles.error}>
            No hay categorías activas para registrar productos.
          </p>
        ) : null}
        {message ? (
          <p
            role={saved ? "status" : "alert"}
            className={saved ? styles.success : styles.error}
          >
            {message}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.button}
            disabled={
              pending || !!gate || (!original && !activeCategories.length)
            }
          >
            {pending ? "Guardando…" : "Guardar producto"}
          </button>
          <Link className={styles.secondary} href={root}>
            Cancelar
          </Link>
        </div>
      </form>
      {gate ? (
        <section
          className={`${styles.panel} ${productStyles.conflict}`}
          aria-label="Revisión antes de volver a guardar"
        >
          {original ? (
            <>
              <h3>
                {gate === "conflict"
                  ? "Este producto cambió desde que lo abriste"
                  : "Comprobá el estado actual del producto"}
              </h3>
              <p>
                La consulta es de solo lectura y no modifica tus campos ni su
                versión cargada.
              </p>
              <button
                className={styles.button}
                type="button"
                disabled={reading}
                onClick={() => void readCurrent()}
              >
                {reading ? "Consultando…" : "Consultar versión vigente"}
              </button>
              {readError ? (
                <p role="alert" className={styles.error}>
                  {readError}
                </p>
              ) : null}
              {candidate ? (
                <div
                  className={productStyles.current}
                  data-current-version={candidate.version}
                >
                  <h4>Versión vigente: {candidate.version}</h4>
                  <dl className={styles.details}>
                    <div>
                      <dt>Nombre</dt>
                      <dd>{candidate.nombre}</dd>
                    </div>
                    <div>
                      <dt>Categoría</dt>
                      <dd>{categoryName(candidate.idCategoria)}</dd>
                    </div>
                    <div>
                      <dt>Descripción</dt>
                      <dd>{candidate.descripcion || "Sin descripción"}</dd>
                    </div>
                    <div>
                      <dt>Precio</dt>
                      <dd>{productPrice(candidate.precio)}</dd>
                    </div>
                    <div>
                      <dt>Existencias</dt>
                      <dd>{candidate.cantidadDisponible}</dd>
                    </div>
                    <div>
                      <dt>Estado</dt>
                      <dd>{candidate.estado}</dd>
                    </div>
                  </dl>
                  <p>
                    La siguiente acción descarta los valores que ingresaste.
                    Después podés editar nuevamente y decidir si guardar.
                  </p>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setOriginal(candidate);
                      setValues(productFormValues(candidate));
                      setErrors({});
                      setGate(null);
                      setCandidate(undefined);
                      setMessage(
                        "Versión vigente cargada. Revisá los datos antes de guardar.",
                      );
                    }}
                  >
                    Descartar mis cambios y cargar versión vigente
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h3>Comprobá si el producto ya existe</h3>
              <p>
                No se repetirá la creación automáticamente. Abrí el listado y
                verificá el resultado antes de habilitar otro intento.
              </p>
              <a
                className={styles.secondary}
                href={root}
                target="_blank"
                rel="noopener noreferrer"
              >
                Revisar listado en otra pestaña
              </a>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setGate(null);
                  setMessage(
                    "Confirmaste la revisión del listado. No hay idempotencia distribuida: un nuevo guardado enviará otra creación.",
                  );
                }}
              >
                Ya revisé el listado; habilitar otro intento
              </button>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

export default function ProductEditor({
  storeId,
  productId,
}: {
  storeId: string;
  productId?: string;
}) {
  const storePath = `/api/mi-negocio/tiendas/${encodeURIComponent(storeId)}`;
  const detail = useBusinessData<
    Store | { store: Store; product: ManagedProduct }
  >(
    productId
      ? `${storePath}/productos/${encodeURIComponent(productId)}`
      : storePath,
  );
  const categories = useBusinessData<{ categories: ManagedCategory[] }>(
    "/api/mi-negocio/categorias",
  );
  if (detail.loading || categories.loading)
    return (
      <p className={styles.panel} role="status">
        Cargando información del producto…
      </p>
    );
  if (
    detail.status !== 200 ||
    categories.status !== 200 ||
    !detail.data ||
    !categories.data
  )
    return (
      <section
        className={styles.panel}
        role="alert"
        data-product-editor-error={
          detail.status !== 200 ? detail.status : categories.status
        }
      >
        <h2>No pudimos cargar el formulario</h2>
        <p>
          La tienda o producto puede no estar disponible entre tus negocios.
          Intentá nuevamente.
        </p>
        <button
          className={styles.button}
          onClick={() => {
            detail.retry();
            categories.retry();
          }}
        >
          Reintentar
        </button>
        <Link href="/mi-negocio/tiendas" className={styles.secondary}>
          Volver a Mis tiendas
        </Link>
      </section>
    );
  const edit = productId
    ? (detail.data as { store: Store; product: ManagedProduct })
    : undefined;
  return (
    <ProductForm
      key={`${storeId}:${productId ?? "new"}`}
      store={edit ? edit.store : (detail.data as Store)}
      product={edit?.product}
      categories={categories.data.categories}
    />
  );
}
