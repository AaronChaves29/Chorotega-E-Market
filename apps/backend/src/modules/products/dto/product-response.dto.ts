export class ProductResponseDto {
  idProducto!: number;
  idTienda!: number;
  idCategoria!: number;
  nombre!: string;
  descripcion!: string | null;
  precio!: string;
  cantidadDisponible!: number;
  estado!: string;
  fechaPublicacion!: Date;
}
