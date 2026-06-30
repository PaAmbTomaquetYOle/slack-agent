import type { DomainEvent } from '../events';
import { OffboardingStartedEvent } from '../events';
import { NotStartedState, InProgressState, PendingRevisionState, FinishedState, CancelledState } from './state';
import type { OffboardingProcessState } from './state';
import type { ProcessId, UserId, ChannelId, InterviewId, DossierId } from '../valueObjects';

export class OffboardingProcess {
  readonly #id: ProcessId;
  readonly #departingUserId: UserId;
  readonly #initiatorId: UserId;
  readonly #createdAt: Date;
  #state: OffboardingProcessState;
  #channelId: ChannelId | null; // populated by later state transitions (SA-3)
  #handoverDossier: string | null; // populated when dossier is generated (SA-4)
  #assignedReviewer: UserId | null; // assigned during review phase (SA-3)
  readonly #tasks: never[]; // placeholder — replace with Task value object in SA-3
  readonly #domainEvents: DomainEvent[];
  #interviewId: InterviewId | null;
  #dossierId: DossierId | null;

  // TypeScript `private` intentional: JS does not support `#` on constructors
  private constructor(
    id: ProcessId,
    departingUserId: UserId,
    initiatorId: UserId,
    createdAt: Date,
  ) {
    this.#id = id;
    this.#departingUserId = departingUserId;
    this.#initiatorId = initiatorId;
    this.#createdAt = createdAt;
    this.#state = new NotStartedState();
    this.#channelId = null;
    this.#handoverDossier = null;
    this.#assignedReviewer = null;
    this.#tasks = [];
    this.#domainEvents = [];
    this.#interviewId = null;
    this.#dossierId = null;
  }

  static create(
    id: ProcessId,
    departingUserId: UserId,
    initiatorId: UserId,
  ): OffboardingProcess {
    const process = new OffboardingProcess(id, departingUserId, initiatorId, new Date());
    process.#state = process.#state.start();
    process.#domainEvents.push(
      new OffboardingStartedEvent(id, departingUserId, initiatorId),
    );
    return process;
  }

  static fromBackend(params: {
    id: ProcessId;
    departingUserId: UserId;
    initiatorId: UserId;
    createdAt: Date;
    state: string;
    interviewId: InterviewId | null;
    dossierId: DossierId | null;
  }): OffboardingProcess {
    const process = new OffboardingProcess(
      params.id,
      params.departingUserId,
      params.initiatorId,
      params.createdAt,
    );
    process.#state = OffboardingProcess.#stateFromName(params.state);
    process.#interviewId = params.interviewId;
    process.#dossierId = params.dossierId;
    return process;
  }

  static #stateFromName(name: string): OffboardingProcessState {
    switch (name) {
      case 'not_started': return new NotStartedState();
      case 'in_progress': return new InProgressState();
      case 'pending_revision': return new PendingRevisionState();
      case 'finished': return new FinishedState();
      case 'cancelled': return new CancelledState();
      default: throw new Error(`Unknown offboarding process state: ${name}`);
    }
  }

  get id(): ProcessId { return this.#id; }
  get departingUserId(): UserId { return this.#departingUserId; }
  get initiatorId(): UserId { return this.#initiatorId; }
  get createdAt(): Date { return new Date(this.#createdAt); }
  get stateName(): string { return this.#state.stateName; }
  get interviewId(): InterviewId | null { return this.#interviewId; }
  get dossierId(): DossierId | null { return this.#dossierId; }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.#domainEvents];
    this.#domainEvents.length = 0;
    return events;
  }
}
