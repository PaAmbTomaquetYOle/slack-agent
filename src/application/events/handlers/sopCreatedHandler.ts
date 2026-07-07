import type { KafkaEventEnvelope, SopCreatedPayload } from '../../../domain';
import type { IMessagingPort } from '../../ports';
import type { IInboundEventHandler } from '../inboundEventHandler';
import { SOP_CREATED } from '../../../domain';

function isSopCreatedPayload(payload: unknown): payload is SopCreatedPayload {
  const p = payload as Partial<SopCreatedPayload> | null;
  return !!p && typeof p.sop_id === 'string' && typeof p.channel_id === 'string'
    && typeof p.author_id === 'string';
}

export class SopCreatedHandler implements IInboundEventHandler {
  readonly eventType = SOP_CREATED;
  readonly #messaging: IMessagingPort;

  constructor(messaging: IMessagingPort) {
    this.#messaging = messaging;
  }

  async handle(envelope: KafkaEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    if (!isSopCreatedPayload(payload)) {
      throw new Error(`Invalid payload for event '${this.eventType}'`);
    }
    await this.#messaging.sendDirectMessage(
      payload.author_id,
      `Thanks! Your answer has been saved as SOP (${payload.sop_id}). :white_check_mark:`,
    );
  }
}
