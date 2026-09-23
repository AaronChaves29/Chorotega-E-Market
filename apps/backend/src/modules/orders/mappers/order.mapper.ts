import type { OrderDetail } from '../../order-details/entities/order-detail.entity';
import type { OrderState } from '../domain/order-state';
import {
  OrderItemResponseDto,
  OrderResponseDto,
} from '../dtos/order-response.dto';
import type { Order } from '../entities/order.entity';

export class OrderMapper {
  static toResponseDto(
    order: Order,
    details: OrderDetail[],
    state: OrderState,
  ): OrderResponseDto {
    return Object.assign(new OrderResponseDto(), {
      idPedido: order.idPedido,
      idCliente: order.idCliente,
      idTienda: order.idTienda,
      idBarrio: order.idBarrio,
      estado: state,
      fechaCreacion: new Date(order.fechaCreacion),
      direccionEntrega: order.direccionEntrega,
      subtotal: order.subtotal,
      tarifaEnvio: order.tarifaEnvio,
      total: order.total,
      items: details.map((detail) =>
        Object.assign(new OrderItemResponseDto(), {
          idDetalle: detail.idDetalle,
          idProducto: detail.idProducto,
          cantidad: detail.cantidad,
          precioUnitario: detail.precioUnitario,
          subtotal: detail.subtotal,
        } satisfies OrderItemResponseDto),
      ),
    } satisfies OrderResponseDto);
  }
}
