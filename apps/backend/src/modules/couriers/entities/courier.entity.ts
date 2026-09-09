import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Delivery } from '../../deliveries/entities/delivery.entity';

@Entity('repartidor')
@Unique('repartidor_id_usuario_key', ['idUsuario'])
@Check(
  'chk_repartidor_disponibilidad',
  `"disponibilidad" IN ('DISPONIBLE', 'OCUPADO', 'INACTIVO')`,
)
export class Courier {
  @PrimaryGeneratedColumn({
    name: 'id_repartidor',
    type: 'int',
    primaryKeyConstraintName: 'repartidor_pkey',
  })
  idRepartidor!: number;

  @Column({ name: 'id_usuario', type: 'int' })
  idUsuario!: number;

  @OneToOne(() => User, (user) => user.repartidor, {
    nullable: false,
    eager: false,
    cascade: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'id_usuario',
    referencedColumnName: 'idUsuario',
    foreignKeyConstraintName: 'fk_repartidor_usuario',
  })
  usuario!: Relation<User>;

  @Column({
    name: 'medio_transporte',
    type: 'varchar',
    length: 50,
  })
  medioTransporte!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'DISPONIBLE',
  })
  disponibilidad!: string;

  @OneToMany(() => Delivery, (delivery) => delivery.repartidor)
  entregas!: Relation<Delivery[]>;
}
