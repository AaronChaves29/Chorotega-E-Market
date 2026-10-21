
export type OrderState =
  | "PENDIENTE"
  | "CONFIRMADO"
  | "PREPARANDO"
  | "EN_CAMINO"
  | "ENTREGADO"
  | "CANCELADO";

export interface OrderItem {
  idDetalle: number;
  idProducto: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
}

export interface Order {
  idPedido: number;
  idCliente: number;
  idTienda: number;
  idBarrio: number;
  estado: OrderState;
  fechaCreacion: string;
  direccionEntrega: string;
  subtotal: string;
  tarifaEnvio: string;
  total: string;
  items: OrderItem[];
}

export interface PaginatedOrders {
  content: Order[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
