import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProductsService } from '../modules/products/products.service';
import { StoresService } from '../modules/stores/services/stores.service';
import { CreateProductDto } from '../modules/products/dto/create-product.dto';
import { ProductSearchQueryDto } from '../modules/products/dto/product-search-query.dto';
import { CreateStoreDto } from '../modules/stores/dtos/create-store.dto';
import { StoreSearchQueryDto } from '../modules/stores/dtos/store-search-query.dto';
import {
  AdminCsrfGuard,
  AdminSessionGuard,
  type AdminRequest,
} from './admin.guards';
import { AdminExceptionFilter } from './admin-exception.filter';
import { domainFormError, pageView, validateForm } from './admin-forms';

@ApiExcludeController()
@Controller('admin')
@UseFilters(AdminExceptionFilter)
@UseGuards(AdminSessionGuard, RolesGuard, AdminCsrfGuard)
@Roles('ADMIN')
export class AdminCatalogController {
  constructor(
    private readonly products: ProductsService,
    private readonly stores: StoresService,
  ) {}

  @Get()
  home(@Res() response: Response): void {
    response.redirect(303, '/admin/products');
  }

  @Get('products')
  async productList(
    @Query() query: ProductSearchQueryDto,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ): Promise<void> {
    response.render('products', {
      ...pageView(await this.products.search(query), query, '/admin/products'),
      csrf: request.adminSession.csrf,
    });
  }

  @Get('stores')
  async storeList(
    @Query() query: StoreSearchQueryDto,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ): Promise<void> {
    response.render('stores', {
      ...pageView(await this.stores.search(query), query, '/admin/stores'),
      csrf: request.adminSession.csrf,
    });
  }

  @Get('products/new')
  productForm(@Req() request: AdminRequest, @Res() response: Response): void {
    response.render('product-form', { csrf: request.adminSession.csrf });
  }

  @Get('stores/new')
  storeForm(@Req() request: AdminRequest, @Res() response: Response): void {
    response.render('store-form', { csrf: request.adminSession.csrf });
  }

  @Post('products')
  async createProduct(
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ): Promise<void> {
    const form = await validateForm(CreateProductDto, body, [
      'idTienda',
      'idCategoria',
      'precio',
      'cantidadDisponible',
    ]);
    const view = { csrf: request.adminSession.csrf, values: form.values };
    if (Object.keys(form.errors).length) {
      response
        .status(400)
        .render('product-form', { ...view, errors: form.errors });
      return;
    }
    try {
      await this.products.create(form.dto, request.user);
      response.redirect(303, '/admin/products');
    } catch (error) {
      const failure = domainFormError(error, {
        'Tienda no encontrada.': 'idTienda',
        'Categoría no encontrada.': 'idCategoria',
      });
      response
        .status(failure.status)
        .render('product-form', { ...view, errors: failure.errors });
    }
  }

  @Post('stores')
  async createStore(
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ): Promise<void> {
    const form = await validateForm(CreateStoreDto, body, ['idEmprendedor']);
    const view = { csrf: request.adminSession.csrf, values: form.values };
    if (Object.keys(form.errors).length) {
      response
        .status(400)
        .render('store-form', { ...view, errors: form.errors });
      return;
    }
    try {
      await this.stores.create(form.dto, request.user);
      response.redirect(303, '/admin/stores');
    } catch (error) {
      const failure = domainFormError(error, {
        'Usuario no encontrado.': 'idEmprendedor',
        'El propietario debe ser un emprendedor activo.': 'idEmprendedor',
      });
      response
        .status(failure.status)
        .render('store-form', { ...view, errors: failure.errors });
    }
  }
}
