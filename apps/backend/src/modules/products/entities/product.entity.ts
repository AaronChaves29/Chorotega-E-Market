import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('producto')
export class Product {
  @PrimaryGeneratedColumn({ name: 'id_producto' })
  idProducto!: number;

  @Column({ name: 'id_tienda', type: 'int' })
  idTienda!: number;

  @Column({ name: 'id_categoria', type: 'int' })
  idCategoria!: number;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcion!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  precio!: string;

  @Column({ name: 'cantidad_disponible', type: 'int', default: 0 })
  cantidadDisponible!: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVO' })
  estado!: string;

  @Column({
    name: 'fecha_publicacion',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaPublicacion!: Date;
}
