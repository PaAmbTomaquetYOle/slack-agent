import type { Consumer, EachMessagePayload } from 'kafkajs';
import type { IEventConsumer, IDeadLetterQueue } from '../../application/ports/index.js';
import type { InboundEventDispatcher } from '../../application/events/index.js';
import { deserializeEnvelope } from './eventDeserializer.js';

export class KafkaEventConsumer implements IEventConsumer {
  readonly #consumer: Consumer;
  readonly #dispatcher: InboundEventDispatcher;
  readonly #dlq: IDeadLetterQueue;
  readonly #topics: string[];

  constructor(consumer: Consumer, dispatcher: InboundEventDispatcher, dlq: IDeadLetterQueue, topics: string[]) {
    this.#consumer = consumer;
    this.#dispatcher = dispatcher;
    this.#dlq = dlq;
    this.#topics = topics;
  }

  async start(): Promise<void> {
    await this.#consumer.connect();
    await this.#consumer.subscribe({ topics: this.#topics, fromBeginning: false });
    await this.#consumer.run({
      eachMessage: async (payload: EachMessagePayload) => this.#process(payload),
    });
  }

  async stop(): Promise<void> {
    await this.#consumer.disconnect();
  }

  async #process({ topic, message }: EachMessagePayload): Promise<void> {
    const raw = message.value ?? Buffer.alloc(0);
    try {
      const envelope = deserializeEnvelope(raw);
      await this.#dispatcher.dispatch(envelope);
    } catch (error) {
      // Never rethrow: KafkaJS commits the offset once eachMessage resolves,
      // so a malformed/unhandleable message must be routed to the DLQ instead
      // of blocking or endlessly retrying the partition.
      await this.#dlq.send(raw, topic, error as Error);
    }
  }
}
