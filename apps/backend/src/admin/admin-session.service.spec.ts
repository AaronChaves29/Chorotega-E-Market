import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { AdminSessionService, ADMIN_COOKIE } from './admin-session.service';
import { CurrentIdentityService } from '../auth/current-identity.service';
import { UsersRepository } from '../modules/users/repositories/users.repository';

describe('Sesión MVC cifrada y CSRF vinculado', () => {
  const secret = randomBytes(32).toString('hex');
  const jwt = new JwtService({ secret });
  const findAuthenticationById = jest.fn();
  const identities = new CurrentIdentityService(jwt, {
    findAuthenticationById,
  } as unknown as UsersRepository);
  beforeEach(() => {
    findAuthenticationById.mockReset().mockResolvedValue({
      idUsuario: 1,
      correo: 'admin@example.test',
      rol: 'ADMIN',
      estado: 'ACTIVO',
    });
  });
  const service = () =>
    new AdminSessionService(
      new ConfigService({ JWT_SECRET: secret, NODE_ENV: 'production' }),
      identities,
    );
  function issue(sessions = service(), token?: string) {
    const cookie = jest.fn<void, [string, string, object]>();
    const session = sessions.issue({ cookie } as unknown as Response, token);
    const value = cookie.mock.calls[0][1];
    return {
      sessions,
      session,
      cookie,
      value,
      request: { headers: { cookie: `${ADMIN_COOKIE}=${value}` } },
    };
  }
  afterEach(() => jest.restoreAllMocks());
  it('cifra el JWT, usa Secure/HttpOnly/Strict y limita la cookie a admin', () => {
    const { cookie, value, sessions, request } = issue(
      service(),
      'jwt-private-marker',
    );
    expect(cookie).toHaveBeenCalledWith(
      ADMIN_COOKIE,
      expect.any(String),
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        path: '/admin',
      }),
    );
    expect(value).not.toContain('jwt-private-marker');
    expect(Buffer.from(value, 'base64url').toString()).not.toContain(
      'jwt-private-marker',
    );
    expect(sessions.read(request)?.token).toBe('jwt-private-marker');
  });
  it('cada sesión rota CSRF y no acepta tokens ajenos ni valores no string', () => {
    const a = issue();
    const b = issue();
    expect(a.session.csrf).not.toBe(b.session.csrf);
    expect(a.sessions.validCsrf(a.session, a.session.csrf)).toBe(true);
    for (const token of [
      b.session.csrf,
      '',
      undefined,
      ['x'],
      {},
      'x'.repeat(64),
    ])
      expect(a.sessions.validCsrf(a.session, token)).toBe(false);
  });
  it('rechaza cookie modificada, duplicada, excesiva y clave distinta', () => {
    const { value, request, sessions } = issue();
    const changed = `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;
    for (const cookie of [
      `${ADMIN_COOKIE}=${changed}`,
      `${ADMIN_COOKIE}=${value}; ${ADMIN_COOKIE}=${value}`,
      `${ADMIN_COOKIE}=${'a'.repeat(6001)}`,
    ])
      expect(sessions.read({ headers: { cookie } })).toBeUndefined();
    const other = new AdminSessionService(
      new ConfigService({ JWT_SECRET: randomBytes(32).toString('hex') }),
      identities,
    );
    expect(other.read(request)).toBeUndefined();
  });
  it('rechaza sesión vencida sin extenderla en lecturas', () => {
    const issued = issue();
    jest.spyOn(Date, 'now').mockReturnValue(issued.session.expiresAt + 1);
    expect(issued.sessions.read(issued.request)).toBeUndefined();
  });
  it('un reinicio con la misma clave conserva sesiones válidas sin memoria compartida', () => {
    const { request, session } = issue();
    expect(service().read(request)).toEqual(session);
  });
  it('verifica JWT real y rechaza identidades inválidas', async () => {
    const sessions = service();
    const token = await jwt.signAsync({
      sub: 'admin@example.test',
      idUsuario: 1,
      rol: 'ADMIN',
    });
    const session = issue(sessions, token).session;
    await expect(sessions.actor(session)).resolves.toMatchObject({
      idUsuario: 1,
      rol: 'ADMIN',
    });
    await expect(sessions.actor(undefined)).rejects.toThrow();
    await expect(
      sessions.actor({ ...session, token: 'invalid' }),
    ).rejects.toThrow();
    const invalid = await jwt.signAsync({
      sub: 'admin@example.test',
      idUsuario: -1,
      rol: 'ADMIN',
    });
    await expect(
      sessions.actor({ ...session, token: invalid }),
    ).rejects.toThrow();
  });
});
