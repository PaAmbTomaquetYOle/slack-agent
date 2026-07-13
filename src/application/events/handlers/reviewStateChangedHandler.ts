import type { KafkaEventEnvelope, ReviewScope, ReviewStateChangedPayload } from '../../../domain/index.js';
import { ProcessId, UserId } from '../../../domain/index.js';
import type { IActiveReviewStore, IMessagingPort } from '../../ports/index.js';
import type { IInboundEventHandler } from '../inboundEventHandler.js';

function isReviewStateChangedPayload(payload: unknown): payload is ReviewStateChangedPayload {
  const p = payload as Partial<ReviewStateChangedPayload> | null;
  return !!p && typeof p.process_id === 'string' && typeof p.previous_state === 'string'
    && typeof p.new_state === 'string' && typeof p.employee_id === 'string';
}

const INTRO_MESSAGES: Record<ReviewScope, string> = {
  monthly:
    ':wave: ¡Hola! Es hora de tu chequeo mensual de conocimiento — unas pocas preguntas rápidas' +
    ' sobre en qué estuviste trabajando últimamente. Cuando quieras, respondé acá para empezar.',
  annual:
    ':wave: ¡Hola! Es hora de tu revisión anual de conocimiento — vamos a repasar todo lo que' +
    ' sabés y en lo que trabajaste este último año, para que quede documentado. Cuando quieras,' +
    ' respondé acá para empezar.',
};

/**
 * Handles the inbound '{monthly,annual}_review.state_changed' events (SA-20). One class,
 * instantiated once per review scope with its own eventType, since the payload shape and
 * behavior are identical — only the wire event_type and the intro message differ.
 *
 * When a review process reaches IN_PROGRESS (started by the backend's scheduler, BE-24), starts
 * tracking it as active and sends the employee an intro DM to kick off the guided interview. Any
 * other transition (finished/cancelled) stops tracking it, defensively — there is no HTTP read
 * model for review processes to reconcile against if this is ever missed.
 */
export class ReviewStateChangedHandler implements IInboundEventHandler {
  readonly eventType: string;
  readonly #reviewScope: ReviewScope;
  readonly #activeReviewStore: IActiveReviewStore;
  readonly #messaging: IMessagingPort;

  constructor(
    eventType: string,
    reviewScope: ReviewScope,
    activeReviewStore: IActiveReviewStore,
    messaging: IMessagingPort,
  ) {
    this.eventType = eventType;
    this.#reviewScope = reviewScope;
    this.#activeReviewStore = activeReviewStore;
    this.#messaging = messaging;
  }

  async handle(envelope: KafkaEventEnvelope): Promise<void> {
    const payload = envelope.payload;
    if (!isReviewStateChangedPayload(payload)) {
      throw new Error(`Invalid payload for event '${this.eventType}'`);
    }
    const employeeId = new UserId(payload.employee_id);

    if (payload.new_state !== 'in_progress') {
      this.#activeReviewStore.end(employeeId);
      return;
    }

    this.#activeReviewStore.start(employeeId, new ProcessId(payload.process_id), this.#reviewScope);
    await this.#messaging.sendDirectMessage(payload.employee_id, INTRO_MESSAGES[this.#reviewScope]);
  }
}
