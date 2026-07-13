import type { KafkaEventEnvelope, OffboardingStateChangedPayload } from '../../../domain/index.js';
import type { IMessagingPort } from '../../ports/index.js';
import type { IInboundEventHandler } from '../inboundEventHandler.js';
import { OFFBOARDING_STATE_CHANGED } from '../../../domain/index.js';

function isOffboardingStateChangedPayload(payload: unknown): payload is OffboardingStateChangedPayload {
  const p = payload as Partial<OffboardingStateChangedPayload> | null;
  return !!p && typeof p.process_id === 'string' && typeof p.previous_state === 'string'
    && typeof p.new_state === 'string' && typeof p.manager_id === 'string';
}

export class OffboardingStateChangedHandler implements IInboundEventHandler {
  readonly eventType = OFFBOARDING_STATE_CHANGED;
  readonly #messaging: IMessagingPort;

  constructor(messaging: IMessagingPort) {
    this.#messaging = messaging;
  }

  async handle(envelope: KafkaEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    if (!isOffboardingStateChangedPayload(payload)) {
      throw new Error(`Invalid payload for event '${this.eventType}'`);
    }
    await this.#messaging.sendDirectMessage(
      payload.manager_id,
      `The offboarding process (${payload.process_id}) moved from *${payload.previous_state}* to *${payload.new_state}*.`,
    );
  }
}
