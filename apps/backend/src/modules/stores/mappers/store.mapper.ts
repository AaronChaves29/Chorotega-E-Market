import { Store } from '../entities/store.entity';
import { StoreResponseDto } from '../dtos/store-response.dto';

export class StoreMapper {
  static toResponseDto(store: Store): StoreResponseDto {
    return {
      idTienda: store.idTienda,
      idEmprendedor: store.idEmprendedor,
      nombre: store.nombre,
      descripcion: store.descripcion,
      direccion: store.direccion,
      telefono: store.telefono,
      horario: store.horario,
      estado: store.estado,
      fechaCreacion: store.fechaCreacion,
    };
  }
}
