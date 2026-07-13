import type { KafkaEventEnvelope, DossierGeneratedPayload } from '../../../domain/index.js';
import { ProcessId, DOSSIER_GENERATED } from '../../../domain/index.js';
import type { IMessagingPort, IOffboardingProcessRepository } from '../../ports/index.js';
import type { IDossierService, IOffboardingOrchestrator } from '../../serviceInterfaces/index.js';
import type { IInboundEventHandler } from '../inboundEventHandler.js';

function isDossierGeneratedPayload(payload: unknown): payload is DossierGeneratedPayload {
  const p = payload as Partial<DossierGeneratedPayload> | null;
  return !!p && typeof p.dossier_id === 'string' && typeof p.process_id === 'string'
    && typeof p.interview_id === 'string';
}

export class DossierGeneratedHandler implements IInboundEventHandler {
  readonly eventType = DOSSIER_GENERATED;
  readonly #messaging: IMessagingPort;
  readonly #repository: IOffboardingProcessRepository;
  readonly #dossierService: IDossierService;
  readonly #orchestrator: IOffboardingOrchestrator;

  constructor(
    messaging: IMessagingPort,
    repository: IOffboardingProcessRepository,
    dossierService: IDossierService,
    orchestrator: IOffboardingOrchestrator,
  ) {
    this.#messaging = messaging;
    this.#repository = repository;
    this.#dossierService = dossierService;
    this.#orchestrator = orchestrator;
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
    await this.#dossierService.publishDossier(payload.process_id);
    this.#orchestrator.onDossierGenerated(payload.process_id);
  }
}
