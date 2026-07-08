import type { KafkaEventEnvelope, InterviewCompletedInboundPayload } from '../../../domain';
import { ProcessId, INBOUND_INTERVIEW_COMPLETED } from '../../../domain';
import type { IMessagingPort, IOffboardingProcessRepository } from '../../ports';
import type { IInboundEventHandler } from '../inboundEventHandler';

function isInterviewCompletedPayload(payload: unknown): payload is InterviewCompletedInboundPayload {
  const p = payload as Partial<InterviewCompletedInboundPayload> | null;
  return !!p && typeof p.interview_id === 'string' && typeof p.process_id === 'string'
    && typeof p.completed_at === 'string';
}

export class InterviewCompletedHandler implements IInboundEventHandler {
  readonly eventType = INBOUND_INTERVIEW_COMPLETED;
  readonly #messaging: IMessagingPort;
  readonly #repository: IOffboardingProcessRepository;

  constructor(messaging: IMessagingPort, repository: IOffboardingProcessRepository) {
    this.#messaging = messaging;
    this.#repository = repository;
  }

  async handle(envelope: KafkaEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    if (!isInterviewCompletedPayload(payload)) {
      throw new Error(`Invalid payload for event '${this.eventType}'`);
    }
    const process = await this.#repository.findById(new ProcessId(payload.process_id));
    if (!process) {
      throw new Error(`Offboarding process '${payload.process_id}' not found`);
    }
    await this.#messaging.sendDirectMessage(
      process.initiatorId.value,
      `The handover interview for process ${payload.process_id} has been completed.`,
    );
  }
}
