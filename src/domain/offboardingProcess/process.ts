import type { DomainEvent } from '../events/index';
import { OffboardingStartedEvent } from '../events/index';
import { NotStartedState } from './state/index';
import type { OffboardingProcessState } from './state/index';
import type { ProcessId, UserId, ChannelId } from '../valueObjects/index';

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

  get id(): ProcessId { return this.#id; }
  get departingUserId(): UserId { return this.#departingUserId; }
  get initiatorId(): UserId { return this.#initiatorId; }
  get createdAt(): Date { return new Date(this.#createdAt); }
  get stateName(): string { return this.#state.stateName; }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.#domainEvents];
    this.#domainEvents.length = 0;
    return events;
  }
}
