import type { KafkaEventEnvelope, OffboardingCompletedPayload } from '../../../domain';
import type { IMessagingPort } from '../../ports';
import type { IInboundEventHandler } from '../inboundEventHandler';
import { OFFBOARDING_COMPLETED } from '../../../domain';

function isOffboardingCompletedPayload(payload: unknown): payload is OffboardingCompletedPayload {
  const p = payload as Partial<OffboardingCompletedPayload> | null;
  return !!p && typeof p.process_id === 'string' && typeof p.manager_id === 'string'
    && typeof p.dossier_id === 'string';
}

export class OffboardingCompletedHandler implements IInboundEventHandler {
  readonly eventType = OFFBOARDING_COMPLETED;
  readonly #messaging: IMessagingPort;

  constructor(messaging: IMessagingPort) {
    this.#messaging = messaging;
  }

  async handle(envelope: KafkaEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    if (!isOffboardingCompletedPayload(payload)) {
      throw new Error(`Invalid payload for event '${this.eventType}'`);
    }
    await this.#messaging.sendDirectMessage(
      payload.manager_id,
      `The offboarding process (${payload.process_id}) is complete. The handover dossier is ready. :white_check_mark:`,
    );
  }
}
