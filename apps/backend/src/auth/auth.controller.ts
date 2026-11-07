import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../common/http/openapi-contract';
import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  AuthRateLimitGuard,
  LimitAuthOperation,
} from './rate-limit/auth-rate-limit.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from '../modules/users/dtos/user-response.dto';
import { RegisterEntrepreneurDto } from './dto/register-entrepreneur.dto';
import { EntrepreneurRegistrationResponseDto } from './dto/entrepreneur-registration-response.dto';
import { EntrepreneurRegistrationService } from './entrepreneur-registration.service';
import { CourierRegistrationService } from './courier-registration.service';
import { RegisterCourierDto } from './dto/register-courier.dto';
import { CourierRegistrationResponseDto } from './dto/courier-registration-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly entrepreneurs: EntrepreneurRegistrationService,
    private readonly couriers: CourierRegistrationService,
  ) {}

  @Post('register/courier')
  @UseGuards(AuthRateLimitGuard)
  @LimitAuthOperation('register')
  @ApiOperation({
    summary: 'Registrar repartidor',
    description:
      'Acceso publico. Crea cuenta REPARTIDOR y perfil DISPONIBLE atomicamente. Rol, disponibilidad y usuario se asignan internamente. No inicia sesion.',
  })
  @ApiBody({ type: RegisterCourierDto })
  @ApiResponse({ status: 201, type: CourierRegistrationResponseDto })
  @ApiProblemResponses([400, 409, 429, 500])
  registerCourier(
    @Body() dto: RegisterCourierDto,
  ): Promise<CourierRegistrationResponseDto> {
    return this.couriers.register(dto);
  }

  @Post('register/entrepreneur')
  @UseGuards(AuthRateLimitGuard)
  @LimitAuthOperation('register')
  @ApiOperation({
    summary: 'Registrar emprendedor y negocio',
    description:
      'Acceso publico. Crea cuenta EMPRENDEDOR y tienda ACTIVA de forma atomica. No acepta rol, estado ni propietario. Despues se inicia sesion.',
  })
  @ApiBody({ type: RegisterEntrepreneurDto })
  @ApiResponse({ status: 201, type: EntrepreneurRegistrationResponseDto })
  @ApiProblemResponses([400, 409, 429, 500])
  registerEntrepreneur(
    @Body() dto: RegisterEntrepreneurDto,
  ): Promise<EntrepreneurRegistrationResponseDto> {
    return this.entrepreneurs.register(dto);
  }

  @ApiOperation({ summary: 'Iniciar sesión', description: 'Acceso público.' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    type: LoginResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 429, 500])
  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  @LimitAuthOperation('login')
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @ApiOperation({
    summary: 'Registrar cliente',
    description:
      'Acceso público. Crea una cuenta con rol CLIENTE; después del registro se debe iniciar sesión.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    type: UserResponseDto,
    isArray: false,
    description: 'Cuenta de cliente creada sin datos de autenticación.',
  })
  @ApiProblemResponses([400, 409, 429, 500])
  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @LimitAuthOperation('register')
  register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Consultar perfil propio',
    description:
      'Cuenta activa autenticada; identidad y rol vigentes en PostgreSQL.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiProblemResponses([401, 500])
  @Header('Cache-Control', 'no-store')
  me(
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<UserResponseDto> {
    return this.authService.profile(request.user.idUsuario);
  }
}
