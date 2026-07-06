import type { Producer } from 'kafkajs';
import type { IDeadLetterQueue } from '../../application/ports';

export class KafkaDeadLetterQueue implements IDeadLetterQueue {
  readonly #producer: Producer;
  readonly #dlqTopic: string;

  constructor(producer: Producer, dlqTopic: string) {
    this.#producer = producer;
    this.#dlqTopic = dlqTopic;
  }

  async send(rawValue: Buffer, sourceTopic: string, error: Error): Promise<void> {
    try {
      await this.#producer.send({
        topic: this.#dlqTopic,
        messages: [{
          value: rawValue,
          headers: { source_topic: sourceTopic, error: error.message },
        }],
      });
    } catch (sendError) {
      console.error(`Failed to publish message from '${sourceTopic}' to DLQ '${this.#dlqTopic}':`, sendError);
    }
  }
}
