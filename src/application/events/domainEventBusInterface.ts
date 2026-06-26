import type { DomainEvent } from '../../domain';

export interface IDomainEventBus {
  subscribe(eventName: string, handler: (event: DomainEvent) => Promise<void>): void;
  publish(event: DomainEvent): Promise<void>;
}
