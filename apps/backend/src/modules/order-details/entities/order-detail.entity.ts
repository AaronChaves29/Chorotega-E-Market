import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('detalle_pedido')
@Unique('uq_detalle_pedido_producto', ['idPedido', 'idProducto'])
@Index('idx_detalle_producto', ['idProducto'])
@Check('chk_detalle_cantidad', `"cantidad" > 0`)
@Check('chk_detalle_precio', `"precio_unitario" > 0`)
@Check('chk_detalle_subtotal', `"subtotal" >= 0`)
@Check(
  'chk_detalle_subtotal_calculado',
  `"subtotal" = "cantidad" * "precio_unitario"`,
)
export class OrderDetail {
  @PrimaryGeneratedColumn({
    name: 'id_detalle',
    type: 'int',
    primaryKeyConstraintName: 'detalle_pedido_pkey',
  })
  idDetalle!: number;

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
    foreignKeyConstraintName: 'fk_detalle_pedido',
  })
  pedido!: Relation<Order>;

  @Column({ name: 'id_producto', type: 'int' })
  idProducto!: number;

  @ManyToOne(() => Product, (product) => product.detallesPedido, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_producto',
    referencedColumnName: 'idProducto',
    foreignKeyConstraintName: 'fk_detalle_producto',
  })
  producto!: Relation<Product>;

  @Column({ type: 'int' })
  cantidad!: number;

  @Column({
    name: 'precio_unitario',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  precioUnitario!: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  subtotal!: string;
}
