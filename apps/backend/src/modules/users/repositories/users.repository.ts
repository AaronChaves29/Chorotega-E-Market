import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { TypeOrmBaseRepository } from '../../../common/repositories/typeorm-base.repository';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersRepository extends TypeOrmBaseRepository<
  User,
  User['idUsuario']
> {
  constructor(@InjectRepository(User) repository: Repository<User>) {
    super(repository);
  }

  protected whereId(id: User['idUsuario']): FindOptionsWhere<User> {
    return { idUsuario: id };
  }
}
