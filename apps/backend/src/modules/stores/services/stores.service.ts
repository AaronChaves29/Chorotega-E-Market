import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { assertCatalogWriter } from '../../../common/security/catalog-write-access';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from '../../users/repositories/users.repository';
import { QueryFailedError } from 'typeorm';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import { CreateStoreDto } from '../dtos/create-store.dto';
import { UpdateStoreDto } from '../dtos/update-store.dto';
import { StoreResponseDto } from '../dtos/store-response.dto';
import { StoreSearchQueryDto } from '../dtos/store-search-query.dto';
import { StoreMapper } from '../mappers/store.mapper';
import {
  StoresRepository,
  type StoreData,
} from '../repositories/stores.repository';

@Injectable()
export class StoresService {
  constructor(
    private readonly storesRepository: StoresRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async search(
    query: StoreSearchQueryDto,
  ): Promise<PaginationResult<StoreResponseDto>> {
    const result = await this.storesRepository.search(query);
    return {
      ...result,
      content: result.content.map((store) => StoreMapper.toResponseDto(store)),
    };
  }

  async findById(id: number): Promise<StoreResponseDto> {
    this.validateId(id);
    const store = await this.storesRepository.findById(id);
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    return StoreMapper.toResponseDto(store);
  }

  async create(
    dto: CreateStoreDto,
    actor: AuthenticatedUser,
  ): Promise<StoreResponseDto> {
    assertCatalogWriter(actor, ['ADMIN', 'EMPRENDEDOR']);
    if (actor.rol === 'EMPRENDEDOR' && dto.idEmprendedor !== actor.idUsuario)
      throw new ForbiddenException('Solo puede crear tiendas a su nombre.');
    const ownerId =
      actor.rol === 'EMPRENDEDOR' ? actor.idUsuario : dto.idEmprendedor;
    await this.requireUser(ownerId, actor.rol === 'ADMIN');
    const store = this.storesRepository.createEntity({
      idEmprendedor: ownerId,
      direccion: dto.direccion,
      telefono: dto.telefono ?? null,
      horario: dto.horario ?? null,
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      estado: dto.estado ?? 'ACTIVA',
    });
    try {
      return StoreMapper.toResponseDto(await this.storesRepository.save(store));
    } catch (error) {
      this.rethrowPersistenceError(error, 'save');
    }
  }

  async update(
    id: number,
    dto: UpdateStoreDto,
    actor: AuthenticatedUser,
  ): Promise<StoreResponseDto> {
    assertCatalogWriter(actor, ['ADMIN', 'EMPRENDEDOR']);
    this.validateId(id);
    const store = await this.requireOwnedStore(id, actor);
    if (
      dto.idEmprendedor !== undefined &&
      dto.idEmprendedor !== store.idEmprendedor
    )
      throw new ForbiddenException(
        'No se permite transferir la propiedad de una tienda.',
      );
    const data: Partial<Omit<StoreData, 'idEmprendedor'>> = {};
    if (dto.direccion !== undefined) data.direccion = dto.direccion;
    if (dto.telefono !== undefined) data.telefono = dto.telefono;
    if (dto.horario !== undefined) data.horario = dto.horario;
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.estado !== undefined) data.estado = dto.estado;
    try {
      const store = await this.storesRepository.updateForActor(id, data, actor);
      if (!store) throw new NotFoundException('Tienda no encontrada.');
      return StoreMapper.toResponseDto(store);
    } catch (error) {
      this.rethrowPersistenceError(error, 'save');
    }
  }

  async remove(id: number, actor: AuthenticatedUser): Promise<void> {
    assertCatalogWriter(actor, ['ADMIN', 'EMPRENDEDOR']);
    this.validateId(id);
    await this.requireOwnedStore(id, actor);
    try {
      if (!(await this.storesRepository.deleteForActor(id, actor))) {
        throw new NotFoundException('Tienda no encontrada.');
      }
    } catch (error) {
      this.rethrowPersistenceError(error, 'delete');
    }
  }

  private async requireUser(
    id: number,
    requireEligible: boolean,
  ): Promise<void> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (
      requireEligible &&
      (user.rol !== 'EMPRENDEDOR' || user.estado !== 'ACTIVO')
    )
      throw new UnprocessableEntityException(
        'El propietario debe ser un emprendedor activo.',
      );
  }

  private async requireOwnedStore(id: number, actor: AuthenticatedUser) {
    const store = await this.storesRepository.findById(id);
    if (
      !store ||
      (actor.rol === 'EMPRENDEDOR' && store.idEmprendedor !== actor.idUsuario)
    )
      throw new NotFoundException('Tienda no encontrada.');
    return store;
  }

  private validateId(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
      throw new BadRequestException(
        'El identificador debe ser un entero positivo de 32 bits.',
      );
    }
  }

  private rethrowPersistenceError(
    error: unknown,
    operation: 'save' | 'delete',
  ): never {
    if (error instanceof QueryFailedError) {
      const driver: unknown = error.driverError;
      if (
        typeof driver === 'object' &&
        driver !== null &&
        'code' in driver &&
        'constraint' in driver
      ) {
        if (
          operation === 'save' &&
          driver.code === '23503' &&
          driver.constraint === 'fk_tienda_emprendedor'
        ) {
          throw new NotFoundException('Usuario no encontrado.');
        }
        if (
          operation === 'delete' &&
          driver.code === '23503' &&
          (driver.constraint === 'fk_producto_tienda' ||
            driver.constraint === 'fk_pedido_tienda')
        ) {
          throw new ConflictException(
            'La tienda tiene productos o pedidos asociados.',
          );
        }
      }
    }
    throw error;
  }
}
