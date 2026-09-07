import type { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';
import type { BaseRepository } from './base.repository';

export abstract class TypeOrmBaseRepository<
  TEntity extends ObjectLiteral,
  TId,
> implements BaseRepository<TEntity, TId> {
  protected constructor(protected readonly repository: Repository<TEntity>) {}

  protected abstract whereId(id: TId): FindOptionsWhere<TEntity>;

  findAll(): Promise<TEntity[]> {
    return this.repository.find();
  }

  findById(id: TId): Promise<TEntity | null> {
    return this.repository.findOneBy(this.whereId(id));
  }

  // TypeORM inserta o actualiza según la clave primaria de la entidad.
  save(entity: TEntity): Promise<TEntity> {
    return this.repository.save(entity);
  }

  // Eliminación física: las restricciones de PostgreSQL siguen aplicándose.
  async deleteById(id: TId): Promise<boolean> {
    const result = await this.repository.delete(this.whereId(id));
    return (result.affected ?? 0) > 0;
  }
}
