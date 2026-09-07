import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Store } from '../../stores/entities/store.entity';

@Entity('producto')
@Index('idx_producto_tienda', ['idTienda'])
@Index('idx_producto_categoria', ['idCategoria'])
@Check('chk_producto_precio', `"precio" > 0`)
@Check('chk_producto_cantidad', `"cantidad_disponible" >= 0`)
@Check('chk_producto_estado', `"estado" IN ('ACTIVO', 'INACTIVO', 'AGOTADO')`)
export class Product {
  @PrimaryGeneratedColumn({
    name: 'id_producto',
    type: 'int',
    primaryKeyConstraintName: 'producto_pkey',
  })
  idProducto!: number;

  @Column({ name: 'id_tienda', type: 'int' })
  idTienda!: number;

  @Column({ name: 'id_categoria', type: 'int' })
  idCategoria!: number;

  @ManyToOne(() => Store, (store) => store.productos, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_tienda',
    referencedColumnName: 'idTienda',
    foreignKeyConstraintName: 'fk_producto_tienda',
  })
  tienda!: Relation<Store>;

  @ManyToOne(() => Category, (category) => category.productos, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_categoria',
    referencedColumnName: 'idCategoria',
    foreignKeyConstraintName: 'fk_producto_categoria',
  })
  categoria!: Relation<Category>;

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
