import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
  ) {}

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
}
