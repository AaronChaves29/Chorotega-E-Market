import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { User } from '../entities/user.entity';

import type { PaginationResult } from '../../../common/pagination/pagination-result';
import type { UserSearchQueryDto } from '../dtos/user-search-query.dto';

export type UserProfileData = Pick<User, 'nombre' | 'apellido' | 'telefono'>;

@Injectable()
export class UsersRepository extends TypeOrmBaseRepository<
  User,
  User['idUsuario']
> {
  constructor(@InjectRepository(User) repository: Repository<User>) {
    super(repository);
  }

  protected whereId(id: User['idUsuario']): FindOptionsWhere<User> {
    return { idUsuario: id };
  }

  async findByEmail(correo: string): Promise<User | null> {
    return this.repository.findOne({
      where: { correo },
    });
  }

  async updateById(
    id: number,
    data: Partial<UserProfileData>,
  ): Promise<User | null> {
    if (Object.keys(data).length > 0) {
      const result = await this.repository.update(this.whereId(id), data);
      if (!result.affected) return null;
    }
    return this.findById(id);
  }

  async search(filters: UserSearchQueryDto): Promise<PaginationResult<User>> {
    const query = this.repository.createQueryBuilder('usuario');
    const sortColumns = {
      idUsuario: 'usuario.idUsuario',
      nombre: 'usuario.nombre',
      apellido: 'usuario.apellido',
      correo: 'usuario.correo',
      rol: 'usuario.rol',
      estado: 'usuario.estado',
    } as const;
    query.orderBy(sortColumns[filters.sortBy], filters.sortDirection);
    if (filters.sortBy !== 'idUsuario')
      query.addOrderBy('usuario.idUsuario', filters.sortDirection);
    for (const field of ['nombre', 'apellido', 'correo'] as const) {
      const value = filters[field];
      if (value !== undefined) {
        // Los nombres de columnas son constantes; solo los valores vienen del cliente.
        const literal = value.replace(/[\\%_]/g, '\\$&');
        query.andWhere(`${sortColumns[field]} ILIKE :${field}`, {
          [field]: `%${literal}%`,
        });
      }
    }
    for (const field of ['rol', 'estado'] as const) {
      if (filters[field] !== undefined) {
        query.andWhere(`${sortColumns[field]} = :${field}`, {
          [field]: filters[field],
        });
      }
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
