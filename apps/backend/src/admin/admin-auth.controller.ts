import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminSessionService } from './admin-session.service';
import { AdminCsrfGuard, AdminSessionGuard } from './admin.guards';
import { AdminExceptionFilter } from './admin-exception.filter';
import { validateForm } from './admin-forms';

@ApiExcludeController()
@UseFilters(AdminExceptionFilter)
@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: AdminSessionService,
  ) {}

  @Get('login')
  async loginForm(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const current = this.sessions.read(request);
    if (current?.token) {
      try {
        const actor = await this.sessions.actor(current);
        if (actor.rol === 'ADMIN') {
          response.redirect(303, '/admin/products');
          return;
        }
      } catch (error) {
        if (!(error instanceof UnauthorizedException)) throw error;
      }
    }
    const session = this.sessions.issue(response);
    response.render('login', { csrf: session.csrf });
  }

  @Post('login')
  @UseGuards(AdminCsrfGuard)
  async login(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const form = await validateForm(LoginDto, body);
    const view = {
      csrf: this.sessions.read(request)!.csrf,
      correo: form.values.correo,
    };
    if (Object.keys(form.errors).length) {
      response.status(400).render('login', { ...view, errors: form.errors });
      return;
    }
    try {
      const result = await this.auth.login(form.dto);
      const actor = await this.sessions.actor({
        csrf: view.csrf,
        expiresAt: Date.now() + 1000,
        token: result.token,
      });
      if (actor.rol !== 'ADMIN') throw new ForbiddenException();
      // Rotación al autenticar: el formulario anónimo no sirve en la nueva sesión.
      this.sessions.issue(response, result.token, result.expiraEnSegundos);
      response.redirect(303, '/admin/products');
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
      response.status(401).render('login', {
        ...view,
        errors: { _form: 'Credenciales inválidas.' },
      });
    }
  }

  @Post('logout')
  @Roles('ADMIN')
  @UseGuards(AdminSessionGuard, RolesGuard, AdminCsrfGuard)
  logout(@Res() response: Response): void {
    this.sessions.clear(response);
    response.redirect(303, '/admin/login');
  }
}
