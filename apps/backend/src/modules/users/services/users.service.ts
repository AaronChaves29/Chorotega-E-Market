import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import {
  UsersRepository,
  type UserProfileData,
} from '../repositories/users.repository';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { UserSearchQueryDto } from '../dtos/user-search-query.dto';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async search(
    query: UserSearchQueryDto,
  ): Promise<PaginationResult<UserResponseDto>> {
    const result = await this.usersRepository.search(query);
    return {
      ...result,
      content: result.content.map((user) => UserMapper.toResponseDto(user)),
    };
  }

  async findById(id: number): Promise<UserResponseDto> {
    this.validateId(id);
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return UserMapper.toResponseDto(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    this.validateId(id);
    const data: Partial<UserProfileData> = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.apellido !== undefined) data.apellido = dto.apellido;
    if (dto.telefono !== undefined) data.telefono = dto.telefono;
    const user = await this.usersRepository.updateById(id, data);
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return UserMapper.toResponseDto(user);
  }

  private validateId(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
      throw new BadRequestException(
        'El identificador debe ser un entero positivo de 32 bits.',
      );
    }
  }
}
