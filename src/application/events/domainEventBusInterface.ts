import type { DomainEvent } from '../../domain/index.js';

export interface IDomainEventBus {
  subscribe(eventName: string, handler: (event: DomainEvent) => Promise<void>): void;
  publish(event: DomainEvent): Promise<void>;
}
