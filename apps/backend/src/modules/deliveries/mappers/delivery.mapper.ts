import { DeliveryResponseDto } from '../dtos/delivery-response.dto';
import { Delivery } from '../entities/delivery.entity';

export class DeliveryMapper {
  static toResponseDto(delivery: Delivery): DeliveryResponseDto {
    return {
      idEntrega: delivery.idEntrega,
      idPedido: delivery.idPedido,
      idRepartidor: delivery.idRepartidor,
      estado: delivery.estado,
      fechaAsignacion: delivery.fechaAsignacion,
      fechaEntrega: delivery.fechaEntrega,
    };
  }
}
