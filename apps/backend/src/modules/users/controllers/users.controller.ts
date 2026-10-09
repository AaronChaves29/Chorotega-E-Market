import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  ApiPageResponse,
  ApiProblemResponses,
} from '../../../common/http/openapi-contract';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import { UsersService } from '../services/users.service';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { UserSearchQueryDto } from '../dtos/user-search-query.dto';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'Listar usuarios',
    description:
      'Roles: ADMIN. Solo administración. PATCH modifica exclusivamente nombre, apellido y telefono; campos omitidos se conservan. Paginación en PostgreSQL, filtros combinables, columnas de orden controladas y desempate por identificador.',
  })
  @ApiPageResponse(UserResponseDto)
  @ApiProblemResponses([400, 401, 403, 500])
  @Get()
  @Roles('ADMIN')
  findAll(
    @Query() query: UserSearchQueryDto,
  ): Promise<PaginationResult<UserResponseDto>> {
    return this.usersService.search(query);
  }

  @ApiOperation({
    summary: 'Consultar usuarios por ID',
    description:
      'Roles: ADMIN. Solo administración. PATCH modifica exclusivamente nombre, apellido y telefono; campos omitidos se conservan.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: UserResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 500])
  @Get(':id')
  @Roles('ADMIN')
  findById(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }

  @ApiOperation({
    summary: 'Actualizar parcialmente usuarios',
    description:
      'Roles: ADMIN. Solo administración. PATCH modifica exclusivamente nombre, apellido y telefono; campos omitidos se conservan. Actualización parcial; null solo en campos nullable.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    type: UserResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 500])
  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }
}
