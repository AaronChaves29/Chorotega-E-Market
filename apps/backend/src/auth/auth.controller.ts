import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ApiProblemResponses } from '../common/http/openapi-contract';
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from '../modules/users/dtos/user-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Iniciar sesión', description: 'Acceso público.' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    type: LoginResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 500])
  @Post('login')
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
  @ApiProblemResponses([400, 409, 500])
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(dto);
  }
}
