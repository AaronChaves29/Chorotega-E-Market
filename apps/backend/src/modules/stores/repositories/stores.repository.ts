import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { Store } from '../entities/store.entity';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import type { StoreSearchQueryDto } from '../dtos/store-search-query.dto';

export type StoreData = Pick<
  Store,
  | 'idEmprendedor'
  | 'nombre'
  | 'descripcion'
  | 'direccion'
  | 'telefono'
  | 'horario'
  | 'estado'
>;

@Injectable()
export class StoresRepository extends TypeOrmBaseRepository<
  Store,
  Store['idTienda']
> {
  constructor(@InjectRepository(Store) repository: Repository<Store>) {
    super(repository);
  }

  protected whereId(id: Store['idTienda']): FindOptionsWhere<Store> {
    return { idTienda: id };
  }

  createEntity(data: StoreData): Store {
    return this.repository.create(data);
  }

  async updateById(
    id: number,
    data: Partial<StoreData>,
  ): Promise<Store | null> {
    if (Object.keys(data).length > 0) {
      const result = await this.repository.update(this.whereId(id), data);
      if (!result.affected) return null;
    }
    return this.findById(id);
  }

  async updateForActor(
    id: number,
    data: Partial<Omit<StoreData, 'idEmprendedor'>>,
    actor: AuthenticatedUser,
  ): Promise<Store | null> {
    const where: FindOptionsWhere<Store> = { idTienda: id };
    if (actor.rol === 'EMPRENDEDOR') where.idEmprendedor = actor.idUsuario;
    if (Object.keys(data).length > 0) {
      const result = await this.repository.update(where, data);
      if (!result.affected) return null;
    }
    return this.repository.findOneBy(where);
  }

  async deleteForActor(id: number, actor: AuthenticatedUser): Promise<boolean> {
    const where: FindOptionsWhere<Store> = { idTienda: id };
    if (actor.rol === 'EMPRENDEDOR') where.idEmprendedor = actor.idUsuario;
    const result = await this.repository.delete(where);
    return (result.affected ?? 0) > 0;
  }

  async search(filters: StoreSearchQueryDto): Promise<PaginationResult<Store>> {
    const query = this.repository.createQueryBuilder('tienda');
    const sortColumns = {
      idTienda: 'tienda.idTienda',
      nombre: 'tienda.nombre',
      estado: 'tienda.estado',
    } as const;
    query.orderBy(sortColumns[filters.sortBy], filters.sortDirection);
    if (filters.sortBy !== 'idTienda') {
      query.addOrderBy('tienda.idTienda', filters.sortDirection);
    }
    if (filters.nombre !== undefined) {
      // Búsqueda literal: % y _ del cliente no son comodines SQL.
      const nombre = filters.nombre.replace(/[\\%_]/g, '\\$&');
      query.andWhere('tienda.nombre ILIKE :nombre', {
        nombre: `%${nombre}%`,
      });
    }
    if (filters.estado !== undefined) {
      query.andWhere('tienda.estado = :estado', { estado: filters.estado });
    }
    if (filters.idEmprendedor !== undefined) {
      query.andWhere('tienda.idEmprendedor = :idEmprendedor', {
        idEmprendedor: filters.idEmprendedor,
      });
    }
    query.skip(filters.page * filters.size).take(filters.size);
    const [content, totalElements] = await query.getManyAndCount();
    return {
      content,
      page: filters.page,
      size: filters.size,
      totalElements,
      totalPages: Math.ceil(totalElements / filters.size),
    };
  }
}
