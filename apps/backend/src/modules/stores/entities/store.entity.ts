import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity('tienda')
@Index('idx_tienda_emprendedor', ['idEmprendedor'])
@Check('chk_tienda_estado', `"estado" IN ('ACTIVA', 'INACTIVA')`)
export class Store {
  @PrimaryGeneratedColumn({
    name: 'id_tienda',
    type: 'int',
    primaryKeyConstraintName: 'tienda_pkey',
  })
  idTienda!: number;

  @Column({ name: 'id_emprendedor', type: 'int' })
  idEmprendedor!: number;

  @ManyToOne(() => User, (user) => user.tiendas, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_emprendedor',
    referencedColumnName: 'idUsuario',
    foreignKeyConstraintName: 'fk_tienda_emprendedor',
  })
  emprendedor!: Relation<User>;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcion!: string | null;

  @Column({ type: 'varchar', length: 255 })
  direccion!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  horario!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVA' })
  estado!: string;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion!: Date;

  @OneToMany(() => Product, (product) => product.tienda)
  productos!: Relation<Product[]>;

  @OneToMany(() => Order, (order) => order.tienda)
  pedidos!: Relation<Order[]>;
}
