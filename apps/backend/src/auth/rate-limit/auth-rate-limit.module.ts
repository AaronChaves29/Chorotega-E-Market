import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { performance } from 'node:perf_hooks';
import {
  AUTH_RATE_LIMIT_CLOCK,
  AUTH_RATE_LIMIT_OPTIONS,
  readAuthRateLimitOptions,
} from './auth-rate-limit.config';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthRateLimitService } from './auth-rate-limit.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AUTH_RATE_LIMIT_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        readAuthRateLimitOptions({
          AUTH_RATE_LIMIT_WINDOW_MS: config.get<unknown>(
            'AUTH_RATE_LIMIT_WINDOW_MS',
          ),
          AUTH_LOGIN_MAX_REQUESTS: config.get<unknown>(
            'AUTH_LOGIN_MAX_REQUESTS',
          ),
          ADMIN_LOGIN_MAX_REQUESTS: config.get<unknown>(
            'ADMIN_LOGIN_MAX_REQUESTS',
          ),
          AUTH_REGISTER_MAX_REQUESTS: config.get<unknown>(
            'AUTH_REGISTER_MAX_REQUESTS',
          ),
        }),
    },
    { provide: AUTH_RATE_LIMIT_CLOCK, useValue: () => performance.now() },
    AuthRateLimitService,
    AuthRateLimitGuard,
  ],
  exports: [AuthRateLimitService, AuthRateLimitGuard],
})
export class AuthRateLimitModule {}
