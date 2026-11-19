import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { CouriersRepository } from '../modules/couriers/repositories/couriers.repository';
import { User } from '../modules/users/entities/user.entity';
import { Courier } from '../modules/couriers/entities/courier.entity';
import { UserMapper } from '../modules/users/mappers/user.mapper';
import { CourierMapper } from '../modules/couriers/mappers/courier.mapper';
import { RegisterCourierDto } from './dto/register-courier.dto';
import { CourierRegistrationResponseDto } from './dto/courier-registration-response.dto';
import { rethrowRegistrationError } from './registration-error';

@Injectable()
export class CourierRegistrationService {
  constructor(private readonly dataSource: DataSource) {}

  async register(
    dto: RegisterCourierDto,
  ): Promise<CourierRegistrationResponseDto> {
    const correo = dto.correo.trim().toLowerCase();
    const claveHash = await bcrypt.hash(dto.clave, 10);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const users = new UsersRepository(manager.getRepository(User));
        const couriers = new CouriersRepository(manager.getRepository(Courier));
        if (await users.findByEmail(correo))
          throw new ConflictException(
            'Ya existe una cuenta con ese correo electronico.',
          );
        const user = await users.save(
          Object.assign(new User(), {
            authId: randomUUID(),
            nombre: dto.nombre.trim(),
            apellido: dto.apellido.trim(),
            correo,
            claveHash,
            telefono: dto.telefono?.trim() ?? null,
            rol: 'REPARTIDOR',
            estado: 'ACTIVO',
          }),
        );
        const courier = await couriers.save(
          Object.assign(new Courier(), {
            idUsuario: user.idUsuario,
            medioTransporte: dto.medioTransporte.trim(),
            disponibilidad: 'DISPONIBLE',
          }),
        );
        return {
          usuario: UserMapper.toResponseDto(user),
          repartidor: CourierMapper.toResponseDto(courier),
        };
      });
    } catch (error) {
      rethrowRegistrationError(error);
    }
  }
}
