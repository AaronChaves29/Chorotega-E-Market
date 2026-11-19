import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { OutboxStore } from './outbox-store';
import { OrderAuditsRepository } from '../repositories/order-audits.repository';

@Injectable()
export class OrderAuditPublisher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private active?: Promise<void>;
  constructor(
    private readonly store: OutboxStore,
    private readonly audits: OrderAuditsRepository,
  ) {}
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => this.log('outbox_poll_failed'));
    }, 1000);
    this.timer.unref();
  }
  runOnce(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.active) return this.active;
    this.active = this.publishBatch().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async publishBatch(): Promise<void> {
    const rows = await this.store.claim(); // transaction ends before any Mongo IO
    const results = await Promise.allSettled(
      rows.map(async (row) => {
        try {
          await this.audits.appendEvent(row.payload.pedidoId, row.payload);
          await this.store.published(row);
        } catch {
          this.log('outbox_publish_failed');
          await this.store.failed(row);
        }
      }),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('No se completó el lote de bitácora.');
  }
  private log(event: 'outbox_poll_failed' | 'outbox_publish_failed'): void {
    // Fixed fields only. Never serialize database errors or payloads.
    try {
      process.stdout.write(
        JSON.stringify({
          event,
          level: 'warn',
          context: 'OrderAuditPublisher',
        }) + '\n',
      );
    } catch {
      /* sink failure cannot expose an error */
    }
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await this.active;
  }
}
