import { CourierResponseDto } from '../dtos/courier-response.dto';
import { Courier } from '../entities/courier.entity';

export class CourierMapper {
  static toResponseDto(courier: Courier): CourierResponseDto {
    return {
      idRepartidor: courier.idRepartidor,
      idUsuario: courier.idUsuario,
      medioTransporte: courier.medioTransporte,
      disponibilidad: courier.disponibilidad,
    };
  }
}
