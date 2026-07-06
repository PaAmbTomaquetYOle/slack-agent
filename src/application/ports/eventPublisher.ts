import type { OutboundEvent } from '../../domain';

export interface IEventPublisher {
  publish(event: OutboundEvent): Promise<void>;
  publishMany(events: OutboundEvent[]): Promise<void>;
}
