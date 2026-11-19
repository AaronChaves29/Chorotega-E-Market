import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { rethrowRegistrationError } from './registration-error';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { User } from '../modules/users/entities/user.entity';
import { UserMapper } from '../modules/users/mappers/user.mapper';
import { UserResponseDto } from '../modules/users/dtos/user-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { JsonLogger } from '../common/observability/json-logger';

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
      rethrowRegistrationError(error);
    }
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    return this.issueCredentials(await this.authenticateCredentials(dto));
  }

  async profile(idUsuario: number): Promise<UserResponseDto> {
    const user = await this.usersRepository.findProfileById(idUsuario);
    if (
      !user ||
      user.estado !== 'ACTIVO' ||
      !['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'].includes(user.rol)
    ) {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
    return UserMapper.toResponseDto(user);
  }

  async loginAdmin(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.authenticateCredentials(dto);
    if (user.rol !== 'ADMIN') throw new ForbiddenException();
    return this.issueCredentials(user);
  }

  private async authenticateCredentials(dto: LoginDto): Promise<User> {
    const user = await this.usersRepository.findByEmail(
      dto.correo.trim().toLowerCase(),
    );

    if (!user || !user.claveHash) {
      new JsonLogger().security('login_failed');
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const claveValida = await bcrypt.compare(dto.clave, user.claveHash);

    if (!claveValida || user.estado !== 'ACTIVO') {
      new JsonLogger().security('login_failed');
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    return user;
  }

  private async issueCredentials(user: User): Promise<LoginResponseDto> {
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
}
