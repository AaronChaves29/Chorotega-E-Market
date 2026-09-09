import {
  Check,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { Courier } from '../../couriers/entities/courier.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity('usuario')
@Unique('usuario_auth_id_key', ['authId'])
@Unique('usuario_correo_key', ['correo'])
@Check(
  'chk_usuario_rol',
  `"rol" IN ('ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR')`,
)
@Check('chk_usuario_estado', `"estado" IN ('ACTIVO', 'INACTIVO')`)
export class User {
  @PrimaryGeneratedColumn({
    name: 'id_usuario',
    type: 'int',
    primaryKeyConstraintName: 'usuario_pkey',
  })
  idUsuario!: number;

  @Column({ name: 'auth_id', type: 'uuid' })
  authId!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 100 })
  apellido!: string;

  @Column({ type: 'varchar', length: 150 })
  correo!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono!: string | null;

  @Column({ type: 'varchar', length: 20 })
  rol!: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVO' })
  estado!: string;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion!: Date;

  @OneToMany(() => Store, (store) => store.emprendedor)
  tiendas!: Relation<Store[]>;

  @OneToMany(() => Order, (order) => order.cliente)
  pedidos!: Relation<Order[]>;

  @OneToMany(() => Courier, (courier) => courier.usuario)
  repartidor!: Relation<Courier> | null;
}
