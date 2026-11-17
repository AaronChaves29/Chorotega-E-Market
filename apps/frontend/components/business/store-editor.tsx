"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Store } from "@/types/catalog";
import {
  changedStoreFields,
  editableStoreFields,
  storeFormValues,
  validateStorePatch,
  type StoreFieldErrors,
} from "@/lib/managed-stores";
import styles from "./business.module.css";

function StoreEditForm({ initial }: { initial: Store }) {
  const [store, setStore] = useState(initial);
  const [values, setValues] = useState(() => storeFormValues(initial));
  const [errors, setErrors] = useState<StoreFieldErrors>({});
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false),
    [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const patch = changedStoreFields(store, values);
    const invalid = validateStorePatch(patch);
    setErrors(invalid);
    setSaved(false);
    setMessage("");
    if (Object.keys(invalid).length) {
      const first = editableStoreFields.find((f) => invalid[f.name]);
      if (first)
        (
          form.elements.namedItem(first.name) as HTMLInputElement | null
        )?.focus();
      return;
    }
    if (!Object.keys(patch).length) {
      setMessage("No hay cambios para guardar.");
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch(
        `/api/mi-negocio/tiendas/${store.idTienda}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
          cache: "no-store",
        },
      );
      if (response.status === 401) {
        window.location.replace("/login?sesion=vencida");
        return;
      }
      if (!response.ok) {
        // Never display upstream SQL, arbitrary Problem Details or stack traces.
        setMessage(
          response.status === 400
            ? "Revisá los campos. El servidor rechazó los cambios; conservamos tus valores."
            : response.status === 404
              ? "La tienda ya no está disponible entre tus negocios. Conservamos tus valores."
              : response.status === 403
                ? "No tenés permiso para actualizar esta tienda."
                : "No pudimos confirmar los cambios. Conservamos tus valores: recargá para comprobar el resultado antes de volver a guardar.",
        );
        return;
      }
      const updated = (await response.json()) as Store;
      setStore(updated);
      setValues(storeFormValues(updated));
      setSaved(true);
      setMessage(
        "Cambios guardados. La información de tu tienda se actualizó correctamente.",
      );
    } catch {
      setMessage(
        "No pudimos confirmar los cambios. Conservamos tus valores: recargá para comprobar el resultado antes de volver a guardar.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <form
      className={styles.panel}
      noValidate
      onSubmit={submit}
      aria-label="Editar información de la tienda"
    >
      <h2>Editar tienda</h2>
      <p className={styles.help}>
        Los campos con * son obligatorios. Dejá vacío un campo opcional para
        eliminar su valor; solo enviamos los campos modificados.
      </p>
      <fieldset className={styles.fields} disabled={pending}>
        <legend className={styles.legend}>Información de {store.nombre}</legend>
        {editableStoreFields.map((field) => {
          const id = `business-${field.name}`;
          const help =
            field.name === "whatsappComercial"
              ? "Número internacional con código de país, por ejemplo +506 8888-8888. Es independiente del teléfono personal; no ingresés un enlace."
              : field.name === "instagramUrl"
                ? "Perfil HTTPS de instagram.com, sin publicaciones ni parámetros."
                : field.name === "facebookUrl"
                  ? "Perfil HTTPS de facebook.com por nombre o profile.php?id=numérico."
                  : `Máximo ${field.max} caracteres.`;
          const props = {
            id,
            name: field.name,
            value: values[field.name],
            required: field.required,
            maxLength: field.max,
            "aria-invalid": errors[field.name] ? (true as const) : undefined,
            "aria-describedby": `${id}-help${errors[field.name] ? ` ${id}-error` : ""}`,
            onChange: (
              event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) =>
              setValues((previous) => ({
                ...previous,
                [field.name]: event.target.value,
              })),
          };
          return (
            <div className={styles.field} key={field.name}>
              <label htmlFor={id}>
                {field.label}
                {field.required ? " *" : " (opcional)"}
              </label>
              {field.name === "descripcion" ? (
                <textarea {...props} rows={4} />
              ) : (
                <input
                  {...props}
                  type={
                    field.name === "telefono" ||
                    field.name === "whatsappComercial"
                      ? "tel"
                      : "text"
                  }
                />
              )}
              <p id={`${id}-help`} className={styles.help}>
                {help}
              </p>
              {errors[field.name] ? (
                <p id={`${id}-error`} className={styles.error} role="alert">
                  {errors[field.name]}
                </p>
              ) : null}
            </div>
          );
        })}
      </fieldset>
      <p className={styles.help}>
        Los contactos comerciales se muestran a usuarios autenticados. Validamos
        su formato, no su titularidad. El propietario y el estado de la tienda
        no se editan aquí.
      </p>
      {message ? (
        <p
          className={saved ? styles.success : styles.error}
          role={saved ? "status" : "alert"}
        >
          {message}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button className={styles.button} type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <Link
          className={styles.secondary}
          href="/mi-negocio/tiendas"
          prefetch={false}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

export default function StoreEditor({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    status: number;
    store?: Store;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(
          `/api/mi-negocio/tiendas/${encodeURIComponent(id)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!active) return;
        if (response.status === 401) {
          window.location.replace("/login?sesion=vencida");
          return;
        }
        const store = response.ok
          ? ((await response.json()) as Store)
          : undefined;
        if (active) setResult({ key, status: response.status, store });
      } catch {
        if (active) setResult({ key, status: 502 });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, key]);
  if (result?.key !== key)
    return (
      <p className={styles.panel} role="status">
        Cargando la información de tu tienda…
      </p>
    );
  if (result.status !== 200 || !result.store)
    return (
      <section
        className={styles.panel}
        role="alert"
        data-management-status={result.status}
      >
        <h2>
          {result.status === 404
            ? "Tienda no encontrada"
            : "No pudimos cargar la tienda"}
        </h2>
        <p>
          {result.status === 404
            ? "No está disponible entre tus negocios."
            : "Intentá nuevamente. Tu sesión no se cerró."}
        </p>
        <div className={styles.actions}>
          <button
            className={styles.button}
            onClick={() => setAttempt((n) => n + 1)}
          >
            Reintentar
          </button>
          <Link href="/mi-negocio/tiendas" className={styles.secondary}>
            Volver a mis tiendas
          </Link>
        </div>
      </section>
    );
  return <StoreEditForm initial={result.store} />;
}
