import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  it('establece Location con el identificador persistido y devuelve el DTO', async () => {
    const result = { idProducto: 42, precio: '10.25' };
    const service = { create: jest.fn().mockResolvedValue(result) };
    const controller = new ProductsController(
      service as unknown as ProductsService,
    );
    const response = { location: jest.fn() };
    const input = {
      idTienda: 1,
      idCategoria: 1,
      nombre: 'Prueba',
      precio: 10.25,
      cantidadDisponible: 1,
    };
    expect(await controller.create(input, response)).toBe(result);
    expect(service.create).toHaveBeenCalledWith(input);
    expect(response.location).toHaveBeenCalledWith('/api/v1/products/42');
  });
});
