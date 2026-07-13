import type { DomainEvent } from '../events/index.js';
import { OffboardingStartedEvent } from '../events/index.js';
import { NotStartedState, InProgressState, PendingRevisionState, FinishedState, CancelledState } from './state/index.js';
import type { OffboardingProcessState } from './state/index.js';
import type { ProcessId, UserId, ChannelId, InterviewId, DossierId } from '../valueObjects/index.js';
import { Task } from './task.js';

export class OffboardingProcess {
  readonly #id: ProcessId;
  readonly #departingUserId: UserId;
  readonly #initiatorId: UserId;
  readonly #createdAt: Date;
  #state: OffboardingProcessState;
  #channelId: ChannelId | null; // populated by later state transitions (SA-3)
  #handoverDossier: string | null; // populated when dossier is generated (SA-4)
  #assignedReviewer: UserId | null; // assigned during review phase (SA-3)
  #tasks: Task[]; // pending Jira/Trello tasks extracted via MCP during the interview (SA-18)
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
      new OffboardingStartedEvent(departingUserId, initiatorId),
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
    tasks?: Task[];
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
    process.#tasks = params.tasks ?? [];
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
  get tasks(): Task[] { return [...this.#tasks]; }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.#domainEvents];
    this.#domainEvents.length = 0;
    return events;
  }

  // In-memory-only transitions for orchestration bookkeeping (SA-10): the backend is the
  // source of truth and persists via Kafka, so these never trigger a write — they just keep a
  // locally tracked process' state consistent with what we expect the backend to reach. Throws
  // InvalidStateTransitionError (via the state objects) on an illegal transition.
  submitForReview(): void {
    this.#state = this.#state.submitForReview();
  }

  complete(): void {
    this.#state = this.#state.complete();
  }

  cancel(): void {
    this.#state = this.#state.cancel();
  }

  // In-memory-only bookkeeping (SA-18): tasks are extracted via MCP during the interview and
  // published to the backend over Kafka, which remains the durable store. This just keeps the
  // locally tracked process consistent with the backend, mirroring submitForReview/complete/cancel.
  assignTasks(tasks: Task[]): void {
    this.#tasks = [...tasks];
  }
}
