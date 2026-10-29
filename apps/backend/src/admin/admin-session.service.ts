import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentIdentityService } from '../auth/current-identity.service';

export interface AdminSession {
  csrf: string;
  expiresAt: number;
  token?: string;
}

export const ADMIN_COOKIE = 'chorotega_admin';

@Injectable()
export class AdminSessionService {
  private readonly key: Buffer;
  private readonly secure: boolean;

  constructor(
    config: ConfigService,
    private readonly identities: CurrentIdentityService,
  ) {
    // Clave con propósito separado; no se guarda el JWT en claro en la cookie.
    this.key = Buffer.from(
      hkdfSync(
        'sha256',
        config.getOrThrow<string>('JWT_SECRET'),
        '',
        'chorotega/admin/session/v1',
        32,
      ),
    );
    this.secure = config.get<string>('NODE_ENV') === 'production';
  }

  read(request: Pick<Request, 'headers'>): AdminSession | undefined {
    const matches = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${ADMIN_COOKIE}=`));
    if (matches.length !== 1) return undefined;
    const value = matches[0].slice(ADMIN_COOKIE.length + 1);
    if (value.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(value))
      return undefined;
    try {
      const data = Buffer.from(value, 'base64url');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        data.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from('chorotega/admin/session/v1'));
      decipher.setAuthTag(data.subarray(12, 28));
      const parsed: unknown = JSON.parse(
        Buffer.concat([
          decipher.update(data.subarray(28)),
          decipher.final(),
        ]).toString('utf8'),
      );
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('csrf' in parsed) ||
        typeof parsed.csrf !== 'string' ||
        !/^[a-f0-9]{64}$/.test(parsed.csrf) ||
        !('expiresAt' in parsed) ||
        typeof parsed.expiresAt !== 'number' ||
        parsed.expiresAt <= Date.now() ||
        ('token' in parsed && typeof parsed.token !== 'string')
      )
        return undefined;
      return parsed as AdminSession;
    } catch {
      return undefined;
    }
  }

  issue(
    response: Response,
    token?: string,
    lifetimeSeconds = 900,
  ): AdminSession {
    const lifetime = Math.min(Math.max(lifetimeSeconds, 1), 3600);
    const session: AdminSession = {
      csrf: randomBytes(32).toString('hex'),
      expiresAt: Date.now() + lifetime * 1000,
      ...(token ? { token } : {}),
    };
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('chorotega/admin/session/v1'));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(session)),
      cipher.final(),
    ]);
    response.cookie(
      ADMIN_COOKIE,
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url'),
      {
        httpOnly: true,
        secure: this.secure,
        sameSite: 'strict',
        path: '/admin',
        maxAge: lifetime * 1000,
      },
    );
    return session;
  }

  clear(response: Response): void {
    response.clearCookie(ADMIN_COOKIE, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      path: '/admin',
    });
  }

  validCsrf(session: AdminSession | undefined, value: unknown): boolean {
    return (
      !!session &&
      typeof value === 'string' &&
      /^[a-f0-9]{64}$/.test(value) &&
      timingSafeEqual(Buffer.from(session.csrf), Buffer.from(value))
    );
  }

  async actor(session: AdminSession | undefined): Promise<AuthenticatedUser> {
    if (!session?.token) throw new UnauthorizedException();
    return this.identities.authenticate(session.token);
  }
}
