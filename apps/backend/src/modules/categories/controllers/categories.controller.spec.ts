jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));
const actor = { sub: 'admin@example.test', idUsuario: 9, rol: 'ADMIN' };
import { CategoriesController } from './categories.controller';
import { CategoriesService } from '../services/categories.service';

describe('CategoriesController', () => {
  it('construye Location con el identificador realmente devuelto por el servicio', async () => {
    const result = {
      idCategoria: 42,
      nombre: 'Alimentos',
      descripcion: null,
      estado: 'ACTIVA',
    };
    const service = { create: jest.fn().mockResolvedValue(result) };
    const controller = new CategoriesController(
      service as unknown as CategoriesService,
    );
    const response = { location: jest.fn() };
    const dto = { nombre: 'Alimentos' };
    expect(await controller.create(dto, response, { user: actor })).toBe(
      result,
    );
    expect(service.create).toHaveBeenCalledWith(dto, actor);
    expect(response.location).toHaveBeenCalledWith('/api/v1/categories/42');
  });
});
