export interface DeliverySearchFilters {
  estado?: string;
  idPedido?: number;
  idRepartidor?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
  page: number;
  size: number;
  sortBy: 'fechaAsignacion' | 'fechaEntrega' | 'idEntrega';
  sortDirection: 'ASC' | 'DESC';
}
