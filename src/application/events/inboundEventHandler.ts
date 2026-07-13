import type { KafkaEventEnvelope } from '../../domain/index.js';

export interface IInboundEventHandler {
  readonly eventType: string;
  handle(envelope: KafkaEventEnvelope): Promise<void>;
}
