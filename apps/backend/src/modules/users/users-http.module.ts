import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from './users.module';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';

// La composición HTTP depende de Auth; el módulo de persistencia no depende de él.
@Module({
  imports: [UsersModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersHttpModule {}
