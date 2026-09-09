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
import { Courier } from '../../couriers/entities/courier.entity';
import { Order } from '../../orders/entities/order.entity';

@Entity('entrega')
@Index('idx_entrega_repartidor', ['idRepartidor'])
@Check(
  'chk_entrega_estado',
  `"estado" IN ('ASIGNADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA')`,
)
export class Delivery {
  @PrimaryGeneratedColumn({
    name: 'id_entrega',
    type: 'int',
    primaryKeyConstraintName: 'entrega_pkey',
  })
  idEntrega!: number;

  @Column({ name: 'id_pedido', type: 'int' })
  idPedido!: number;

  @ManyToOne(() => Order, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_pedido',
    referencedColumnName: 'idPedido',
    foreignKeyConstraintName: 'fk_entrega_pedido',
  })
  pedido!: Relation<Order>;

  @Column({ name: 'id_repartidor', type: 'int' })
  idRepartidor!: number;

  @ManyToOne(() => Courier, (courier) => courier.entregas, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_repartidor',
    referencedColumnName: 'idRepartidor',
    foreignKeyConstraintName: 'fk_entrega_repartidor',
  })
  repartidor!: Relation<Courier>;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'ASIGNADA',
  })
  estado!: string;

  @Column({
    name: 'fecha_asignacion',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaAsignacion!: Date;

  @Column({
    name: 'fecha_entrega',
    type: 'timestamp',
    nullable: true,
  })
  fechaEntrega!: Date | null;
}
