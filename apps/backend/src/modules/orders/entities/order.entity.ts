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
import { Neighborhood } from '../../neighborhoods/entities/neighborhood.entity';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { Delivery } from '../../deliveries/entities/delivery.entity';

@Entity('pedido')
@Index('idx_pedido_cliente', ['idCliente'])
@Index('idx_pedido_tienda', ['idTienda'])
@Index('idx_pedido_barrio', ['idBarrio'])
@Check(
  'chk_pedido_estado',
  `"estado" IN (
    'PENDIENTE',
    'CONFIRMADO',
    'PREPARANDO',
    'EN_CAMINO',
    'ENTREGADO',
    'CANCELADO'
  )`,
)
@Check('chk_pedido_subtotal', `"subtotal" >= 0`)
@Check('chk_pedido_tarifa', `"tarifa_envio" >= 0`)
@Check('chk_pedido_total', `"total" >= 0`)
@Check('chk_pedido_total_calculado', `"total" = "subtotal" + "tarifa_envio"`)
export class Order {
  @PrimaryGeneratedColumn({
    name: 'id_pedido',
    type: 'int',
    primaryKeyConstraintName: 'pedido_pkey',
  })
  idPedido!: number;

  @Column({ name: 'id_cliente', type: 'int' })
  idCliente!: number;

  @ManyToOne(() => User, (user) => user.pedidos, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_cliente',
    referencedColumnName: 'idUsuario',
    foreignKeyConstraintName: 'fk_pedido_cliente',
  })
  cliente!: Relation<User>;

  @Column({ name: 'id_tienda', type: 'int' })
  idTienda!: number;

  @ManyToOne(() => Store, (store) => store.pedidos, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_tienda',
    referencedColumnName: 'idTienda',
    foreignKeyConstraintName: 'fk_pedido_tienda',
  })
  tienda!: Relation<Store>;

  @Column({ name: 'id_barrio', type: 'int' })
  idBarrio!: number;

  @ManyToOne(() => Neighborhood, (neighborhood) => neighborhood.pedidos, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_barrio',
    referencedColumnName: 'idBarrio',
    foreignKeyConstraintName: 'fk_pedido_barrio',
  })
  barrio!: Relation<Neighborhood>;

  @Column({
    name: 'fecha_creacion',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  fechaCreacion!: Date;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado!: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  subtotal!: string;

  @Column({
    name: 'tarifa_envio',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  tarifaEnvio!: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  total!: string;

  @Column({
    name: 'direccion_entrega',
    type: 'varchar',
    length: 255,
  })
  direccionEntrega!: string;

  @OneToMany(() => OrderDetail, (orderDetail) => orderDetail.pedido)
  detalles!: Relation<OrderDetail[]>;

  @OneToMany(() => Delivery, (delivery) => delivery.pedido)
  entregas!: Relation<Delivery[]>;
}
