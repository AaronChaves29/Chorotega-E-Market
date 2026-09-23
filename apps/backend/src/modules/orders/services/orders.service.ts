import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OrderDetail } from '../../order-details/entities/order-detail.entity';
import { fromCents, lineSubtotal, toCents } from '../domain/order-money';
import { transitionOrderState } from '../domain/order-state';
import { CreateOrderDto } from '../dtos/create-order.dto';
import { OrderResponseDto } from '../dtos/order-response.dto';
import { Order } from '../entities/order.entity';
import {
  BuyerUnavailableException,
  DuplicateOrderProductException,
  InsufficientOrderStockException,
  InvalidOrderInputException,
  MixedOrderStoresException,
  OrderNeighborhoodUnavailableException,
  OrderProductInactiveException,
  OrderProductNotFoundException,
  OrderStoreUnavailableException,
} from '../exceptions/order.exceptions';
import { OrderMapper } from '../mappers/order.mapper';
import {
  OrderTransaction,
  type OrderTransactionRunner,
} from '../transactions/order-transaction';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(OrderTransaction)
    private readonly transaction: OrderTransactionRunner,
  ) {}

  // idCliente proviene del contexto confiable del llamador, no del DTO de compra.
  async createAndConfirm(
    idCliente: number,
    input: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    if (
      !Number.isInteger(idCliente) ||
      idCliente < 1 ||
      idCliente > 2_147_483_647 ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input)
    ) {
      throw new InvalidOrderInputException();
    }
    const dto = plainToInstance(CreateOrderDto, input);
    if (
      validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }).length
    ) {
      throw new InvalidOrderInputException();
    }
    const quantities = new Map<number, number>();
    for (const item of dto.items) {
      if (quantities.has(item.idProducto))
        throw new DuplicateOrderProductException(item.idProducto);
      quantities.set(item.idProducto, item.cantidad);
    }

    return this.transaction.run(async (repositories) => {
      const buyer = await repositories.users.findById(idCliente);
      if (!buyer || buyer.estado !== 'ACTIVO')
        throw new BuyerUnavailableException();
      const neighborhood = await repositories.neighborhoods.findById(
        dto.idBarrio,
      );
      if (!neighborhood || neighborhood.estado !== 'ACTIVO')
        throw new OrderNeighborhoodUnavailableException();

      const products = await repositories.products.findByIdsForUpdate([
        ...quantities.keys(),
      ]);
      const productsById = new Map(
        products.map((product) => [product.idProducto, product]),
      );
      for (const id of quantities.keys()) {
        if (!productsById.has(id)) throw new OrderProductNotFoundException(id);
      }
      for (const product of products) {
        if (product.estado !== 'ACTIVO')
          throw new OrderProductInactiveException(product.idProducto);
      }
      const storeIds = new Set(products.map((product) => product.idTienda));
      for (const id of storeIds) {
        const store = await repositories.stores.findById(id);
        if (!store || store.estado !== 'ACTIVA')
          throw new OrderStoreUnavailableException();
      }
      if (storeIds.size !== 1) throw new MixedOrderStoresException();

      const details: OrderDetail[] = [];
      for (const item of dto.items) {
        const product = productsById.get(item.idProducto)!;
        if (product.cantidadDisponible < item.cantidad)
          throw new InsufficientOrderStockException(product.idProducto);
        details.push(
          Object.assign(new OrderDetail(), {
            idProducto: product.idProducto,
            cantidad: item.cantidad,
            precioUnitario: fromCents(toCents(product.precio)),
            subtotal: lineSubtotal(product.precio, item.cantidad),
          } satisfies Partial<OrderDetail>),
        );
      }
      const subtotalCents = details.reduce(
        (sum, detail) => sum + toCents(detail.subtotal),
        0n,
      );
      const shippingCents = toCents(neighborhood.tarifaEnvio);
      let order = await repositories.orders.save(
        Object.assign(new Order(), {
          idCliente,
          idTienda: products[0].idTienda,
          idBarrio: neighborhood.idBarrio,
          direccionEntrega: dto.direccionEntrega.trim(),
          estado: 'PENDIENTE',
          subtotal: fromCents(subtotalCents),
          tarifaEnvio: fromCents(shippingCents),
          total: fromCents(subtotalCents + shippingCents),
        } satisfies Partial<Order>),
      );
      const savedDetails: OrderDetail[] = [];
      for (const detail of details) {
        detail.idPedido = order.idPedido;
        savedDetails.push(await repositories.details.save(detail));
      }
      for (const product of products) {
        product.cantidadDisponible -= quantities.get(product.idProducto)!;
        await repositories.products.save(product);
      }
      const state = transitionOrderState(order.estado, 'CONFIRMADO');
      order.estado = state;
      order = await repositories.orders.save(order);
      return OrderMapper.toResponseDto(order, savedDetails, state);
    });
  }
}
