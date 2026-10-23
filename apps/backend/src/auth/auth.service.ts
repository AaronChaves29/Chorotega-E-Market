import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { User } from '../modules/users/entities/user.entity';
import { UserMapper } from '../modules/users/mappers/user.mapper';
import { UserResponseDto } from '../modules/users/dtos/user-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const correo = dto.correo.trim().toLowerCase();
    const existingUser = await this.usersRepository.findByEmail(correo);
    if (existingUser) {
      throw new ConflictException(
        'Ya existe una cuenta con ese correo electrónico.',
      );
    }

    const user = Object.assign(new User(), {
      authId: randomUUID(),
      nombre: dto.nombre,
      apellido: dto.apellido,
      correo,
      claveHash: await bcrypt.hash(dto.clave, 10),
      telefono: dto.telefono ?? null,
      rol: 'CLIENTE',
    });

    try {
      return UserMapper.toResponseDto(await this.usersRepository.save(user));
    } catch (error) {
      this.rethrowDuplicateEmail(error);
    }
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.usersRepository.findByEmail(dto.correo);

    if (!user || !user.claveHash) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const claveValida = await bcrypt.compare(dto.clave, user.claveHash);

    if (!claveValida) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const token = await this.jwtService.signAsync({
      sub: user.correo,
      idUsuario: user.idUsuario,
      rol: user.rol,
    });

    return {
      token,
      tipo: 'Bearer',
      expiraEnSegundos: 3600,
    };
  }

  private rethrowDuplicateEmail(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driver: unknown = error.driverError;
      if (
        typeof driver === 'object' &&
        driver !== null &&
        'code' in driver &&
        'constraint' in driver &&
        driver.code === '23505' &&
        driver.constraint === 'usuario_correo_key'
      ) {
        throw new ConflictException(
          'Ya existe una cuenta con ese correo electrónico.',
        );
      }
    }
    throw error;
  }
}
