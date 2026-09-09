import { Order } from '../../orders/entities/order.entity';
import {
  Check,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';

@Entity('barrio')
@Unique('barrio_nombre_key', ['nombre'])
@Check('chk_barrio_tarifa', `"tarifa_envio" >= 0`)
@Check('chk_barrio_estado', `"estado" IN ('ACTIVO', 'INACTIVO')`)
export class Neighborhood {
  @PrimaryGeneratedColumn({
    name: 'id_barrio',
    type: 'int',
    primaryKeyConstraintName: 'barrio_pkey',
  })
  idBarrio!: number;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({
    name: 'tarifa_envio',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  tarifaEnvio!: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVO' })
  estado!: string;

  @OneToMany(() => Order, (order) => order.barrio)
  pedidos!: Relation<Order[]>;
}
