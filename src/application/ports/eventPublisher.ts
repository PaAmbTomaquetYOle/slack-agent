import type { OutboundEvent } from '../../domain/index.js';

export interface IEventPublisher {
  publish(event: OutboundEvent): Promise<void>;
  publishMany(events: OutboundEvent[]): Promise<void>;
}
