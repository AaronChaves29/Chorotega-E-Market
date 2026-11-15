"use client";
import type { Neighborhood } from "@/types/catalog";
import { cents, colones } from "@/lib/cart";

export default function DeliveryFields({
  neighborhoods,
  loading,
  error,
  neighborhood,
  address,
  onNeighborhood,
  onAddress,
  disabled = false,
}: {
  neighborhoods: Neighborhood[];
  loading: boolean;
  error: string;
  neighborhood: string;
  address: string;
  onNeighborhood: (value: string) => void;
  onAddress: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="create-order-delivery-fields">
      <div className="create-order-field">
        <label htmlFor="neighborhood" className="create-order-label">
          Barrio
        </label>
        {loading ? (
          <p role="status">Cargando barrios...</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <select
            id="neighborhood"
            className="create-order-input"
            value={neighborhood}
            disabled={disabled}
            onChange={(event) => onNeighborhood(event.target.value)}
          >
            <option value="">Seleccioná un barrio</option>
            {neighborhoods.map((n) => (
              <option key={n.idBarrio} value={n.idBarrio}>
                {n.nombre} — Envío: {colones(cents(n.tarifaEnvio))}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="create-order-field">
        <label htmlFor="delivery-address" className="create-order-label">
          Dirección de entrega
        </label>
        <textarea
          id="delivery-address"
          className="create-order-input create-order-textarea"
          value={address}
          disabled={disabled}
          onChange={(event) => onAddress(event.target.value)}
          maxLength={255}
          rows={3}
          placeholder="Ejemplo: Casa azul, 100 metros al norte de la escuela"
        />
        <p className="create-order-help">Máximo 255 caracteres.</p>
      </div>
    </div>
  );
}
