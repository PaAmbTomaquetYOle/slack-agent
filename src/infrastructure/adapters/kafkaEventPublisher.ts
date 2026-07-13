import type { Producer, TopicMessages } from 'kafkajs';
import type { IEventPublisher } from '../../application/ports/index.js';
import type { KafkaEventEnvelope, OutboundEvent } from '../../domain/index.js';

export class KafkaEventPublisher implements IEventPublisher {
  readonly #producer: Producer;
  readonly #topicPrefix: string;

  constructor(producer: Producer, topicPrefix: string) {
    this.#producer = producer;
    this.#topicPrefix = topicPrefix;
  }

  #toTopicMessage(event: OutboundEvent): { topic: string; key: string; value: string } {
    const envelope: KafkaEventEnvelope = {
      event_id: crypto.randomUUID(),
      event_type: event.eventType,
      occurred_at: new Date().toISOString(),
      payload: event.payload as unknown as Record<string, unknown>,
    };
    const topic = `${this.#topicPrefix}.${event.eventType}`;
    const processId = envelope.payload['process_id'];
    const key = typeof processId === 'string' && processId ? processId : envelope.event_id;
    return { topic, key, value: JSON.stringify(envelope) };
  }

  async publish(event: OutboundEvent): Promise<void> {
    const { topic, key, value } = this.#toTopicMessage(event);
    try {
      await this.#producer.send({
        topic,
        messages: [{ key, value }],
      });
    } catch (error) {
      // Publishing must never block the Slack conversational flow.
      console.warn(`Failed to publish event '${event.eventType}' to Kafka:`, error);
    }
  }

  async publishMany(events: OutboundEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const messagesByTopic = new Map<string, TopicMessages['messages']>();
    for (const event of events) {
      const { topic, key, value } = this.#toTopicMessage(event);
      const messages = messagesByTopic.get(topic) ?? [];
      messages.push({ key, value });
      messagesByTopic.set(topic, messages);
    }
    const topicMessages: TopicMessages[] = Array.from(messagesByTopic, ([topic, messages]) => ({
      topic,
      messages,
    }));
    try {
      await this.#producer.sendBatch({ topicMessages });
    } catch (error) {
      // Publishing must never block the Slack conversational flow.
      console.warn('Failed to publish batch of events to Kafka:', error);
    }
  }
}
