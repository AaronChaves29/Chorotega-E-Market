import { NeighborhoodResponseDto } from '../dtos/neighborhood-response.dto';
import { Neighborhood } from '../entities/neighborhood.entity';

export class NeighborhoodMapper {
  static toResponseDto(neighborhood: Neighborhood): NeighborhoodResponseDto {
    return {
      idBarrio: neighborhood.idBarrio,
      nombre: neighborhood.nombre,
      tarifaEnvio: neighborhood.tarifaEnvio,
      estado: neighborhood.estado,
    };
  }
}
