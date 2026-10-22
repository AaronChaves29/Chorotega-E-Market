export interface BaseRepository<TEntity, TId> {
  findAll(): Promise<TEntity[]>;
  findById(id: TId): Promise<TEntity | null>;
  save(entity: TEntity): Promise<TEntity>;
  deleteById(id: TId): Promise<boolean>;
}
