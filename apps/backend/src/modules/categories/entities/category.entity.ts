import {
  Check,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity('categoria')
@Unique('categoria_nombre_key', ['nombre'])
@Check('chk_categoria_estado', `"estado" IN ('ACTIVA', 'INACTIVA')`)
export class Category {
  @PrimaryGeneratedColumn({
    name: 'id_categoria',
    type: 'int',
    primaryKeyConstraintName: 'categoria_pkey',
  })
  idCategoria!: number;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVA' })
  estado!: string;

  @OneToMany(() => Product, (product) => product.categoria)
  productos!: Relation<Product[]>;
}
