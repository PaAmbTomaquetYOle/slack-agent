import type { KafkaEventEnvelope, DossierGeneratedPayload } from '../../../domain';
import { ProcessId, DOSSIER_GENERATED } from '../../../domain';
import type { IMessagingPort, IOffboardingProcessRepository } from '../../ports';
import type { IInboundEventHandler } from '../inboundEventHandler';

function isDossierGeneratedPayload(payload: unknown): payload is DossierGeneratedPayload {
  const p = payload as Partial<DossierGeneratedPayload> | null;
  return !!p && typeof p.dossier_id === 'string' && typeof p.process_id === 'string'
    && typeof p.interview_id === 'string';
}

export class DossierGeneratedHandler implements IInboundEventHandler {
  readonly eventType = DOSSIER_GENERATED;
  readonly #messaging: IMessagingPort;
  readonly #repository: IOffboardingProcessRepository;

  constructor(messaging: IMessagingPort, repository: IOffboardingProcessRepository) {
    this.#messaging = messaging;
    this.#repository = repository;
  }

  async handle(envelope: KafkaEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    if (!isDossierGeneratedPayload(payload)) {
      throw new Error(`Invalid payload for event '${this.eventType}'`);
    }
    const process = await this.#repository.findById(new ProcessId(payload.process_id));
    if (!process) {
      throw new Error(`Offboarding process '${payload.process_id}' not found`);
    }
    await this.#messaging.sendDirectMessage(
      process.initiatorId.value,
      `The handover dossier for process ${payload.process_id} has been generated.`,
    );
  }
}
