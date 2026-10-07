import { StoresController } from './stores.controller';
import { StoresService } from '../services/stores.service';

describe('StoresController', () => {
  it('construye Location con el identificador realmente devuelto por el servicio', async () => {
    const result = {
      idTienda: 42,
      idEmprendedor: 3,
      direccion: 'Nicoya',
      telefono: null,
      horario: null,
      fechaCreacion: new Date(),
      nombre: 'Alimentos',
      descripcion: null,
      estado: 'ACTIVA',
    };
    const service = { create: jest.fn().mockResolvedValue(result) };
    const controller = new StoresController(
      service as unknown as StoresService,
    );
    const response = { location: jest.fn() };
    const dto = { idEmprendedor: 3, nombre: 'Alimentos', direccion: 'Nicoya' };
    expect(await controller.create(dto, response)).toBe(result);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(response.location).toHaveBeenCalledWith('/api/v1/stores/42');
  });
});
