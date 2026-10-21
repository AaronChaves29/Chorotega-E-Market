export interface Store {
  idTienda: number;
  idEmprendedor: number;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  telefono: string | null;
  horario: string | null;
  estado: "ACTIVA" | "INACTIVA";
  fechaCreacion: string;
}

export interface Product {
  idProducto: number;
  idTienda: number;
  idCategoria: number;
  nombre: string;
  descripcion: string | null;
  precio: string;
  cantidadDisponible: number;
  estado: "ACTIVO" | "INACTIVO" | "AGOTADO";
  fechaPublicacion: string;
}

export interface Neighborhood {
  idBarrio: number;
  nombre: string;
  tarifaEnvio: string;
  estado: "ACTIVO" | "INACTIVO";
}

export interface PaginatedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface CreateOrderItem {
  idProducto: number;
  cantidad: number;
}

export interface CreateOrderRequest {
  idBarrio: number;
  direccionEntrega: string;
  items: CreateOrderItem[];
}