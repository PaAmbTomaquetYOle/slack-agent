import type { KafkaEventEnvelope } from '../../domain';

export interface IInboundEventHandler {
  readonly eventType: string;
  handle(envelope: KafkaEventEnvelope): Promise<void>;
}
