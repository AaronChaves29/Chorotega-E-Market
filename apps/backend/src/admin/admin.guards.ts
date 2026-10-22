import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  AdminSessionService,
  type AdminSession,
} from './admin-session.service';

export type AdminRequest = Request & {
  user: AuthenticatedUser;
  adminSession: AdminSession;
};

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly sessions: AdminSessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const session = this.sessions.read(request);
    request.user = await this.sessions.actor(session);
    request.adminSession = session!;
    return true;
  }
}

@Injectable()
export class AdminCsrfGuard implements CanActivate {
  constructor(private readonly sessions: AdminSessionService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const body: unknown = request.body;
    const token =
      body && typeof body === 'object' && '_csrf' in body
        ? body._csrf
        : undefined;
    if (!this.sessions.validCsrf(this.sessions.read(request), token))
      throw new ForbiddenException(
        'El formulario venció o no es válido. Recargue la página.',
      );
    return true;
  }
}
