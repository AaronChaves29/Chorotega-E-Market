import type { OrderState } from '../domain/order-state';

export class OrderItemResponseDto {
  idDetalle!: number;
  idProducto!: number;
  cantidad!: number;
  precioUnitario!: string;
  subtotal!: string;
}

export class OrderResponseDto {
  idPedido!: number;
  idCliente!: number;
  idTienda!: number;
  idBarrio!: number;
  estado!: OrderState;
  fechaCreacion!: Date;
  direccionEntrega!: string;
  subtotal!: string;
  tarifaEnvio!: string;
  total!: string;
  items!: OrderItemResponseDto[];
}
