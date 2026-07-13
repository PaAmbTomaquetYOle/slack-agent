import type { DomainEvent } from '../../domain/index.js';
import type { IDomainEventBus } from './domainEventBusInterface.js';

type DomainEventHandler = (event: DomainEvent) => Promise<void>;

export class DomainEventBus implements IDomainEventBus {
  readonly #handlers: Map<string, DomainEventHandler[]> = new Map();

  subscribe(eventName: string, handler: DomainEventHandler): void {
    const existing = this.#handlers.get(eventName) ?? [];
    existing.push(handler);
    this.#handlers.set(eventName, existing);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.#handlers.get(event.eventName) ?? [];
    await Promise.all(handlers.map(h => h(event)));
  }
}
