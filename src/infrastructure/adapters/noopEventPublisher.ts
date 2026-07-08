import type { IEventPublisher } from '../../application/ports';
import type { OutboundEvent } from '../../domain';

/**
 * Used when Kafka is not configured or unreachable so the Slack bot's
 * conversational flow is never blocked by event publishing.
 */
export class NoOpEventPublisher implements IEventPublisher {
  async publish(event: OutboundEvent): Promise<void> {
    void event;
  }

  async publishMany(events: OutboundEvent[]): Promise<void> {
    void events;
  }
}
