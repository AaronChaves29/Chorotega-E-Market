import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { StoresRepository } from '../modules/stores/repositories/stores.repository';
import { User } from '../modules/users/entities/user.entity';
import { Store } from '../modules/stores/entities/store.entity';
import { UserMapper } from '../modules/users/mappers/user.mapper';
import { StoreMapper } from '../modules/stores/mappers/store.mapper';
import { RegisterEntrepreneurDto } from './dto/register-entrepreneur.dto';
import { EntrepreneurRegistrationResponseDto } from './dto/entrepreneur-registration-response.dto';
import { rethrowRegistrationError } from './registration-error';

@Injectable()
export class EntrepreneurRegistrationService {
  constructor(private readonly dataSource: DataSource) {}

  async register(
    dto: RegisterEntrepreneurDto,
  ): Promise<EntrepreneurRegistrationResponseDto> {
    const correo = dto.correo.trim().toLowerCase();
    // Do expensive hashing before opening the transaction.
    const claveHash = await bcrypt.hash(dto.clave, 10);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const users = new UsersRepository(manager.getRepository(User));
        const stores = new StoresRepository(manager.getRepository(Store));
        if (await users.findByEmail(correo))
          throw new ConflictException(
            'Ya existe una cuenta con ese correo electrónico.',
          );
        const telefono = dto.telefono?.trim() ?? null;
        const user = await users.save(
          Object.assign(new User(), {
            authId: randomUUID(),
            nombre: dto.nombre.trim(),
            apellido: dto.apellido.trim(),
            correo,
            claveHash,
            telefono,
            rol: 'EMPRENDEDOR',
            estado: 'ACTIVO',
          }),
        );
        const store = await stores.save(
          stores.createEntity({
            idEmprendedor: user.idUsuario,
            nombre: dto.tienda.nombre.trim(),
            direccion: dto.tienda.direccion.trim(),
            descripcion: dto.tienda.descripcion?.trim() ?? null,
            horario: dto.tienda.horario?.trim() ?? null,
            telefono,
            estado: 'ACTIVA',
          }),
        );
        return {
          usuario: UserMapper.toResponseDto(user),
          tienda: StoreMapper.toResponseDto(store),
        };
      });
    } catch (error) {
      rethrowRegistrationError(error);
    }
  }
}
