export class StoreResponseDto {
  idTienda!: number;
  idEmprendedor!: number;
  nombre!: string;
  descripcion!: string | null;
  direccion!: string;
  telefono!: string | null;
  horario!: string | null;
  estado!: string;
  fechaCreacion!: Date;
}
