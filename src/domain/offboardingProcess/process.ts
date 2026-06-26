import type { DomainEvent } from '../events/index.js';
import { OffboardingStartedEvent } from '../events/index.js';
import { NotStartedState } from './state/index.js';
import type { OffboardingProcessState } from './state/index.js';
import type { ProcessId, UserId, ChannelId } from '../valueObjects/index.js';

export class OffboardingProcess {
  readonly #id: ProcessId;
  readonly #departingUserId: UserId;
  readonly #initiatorId: UserId;
  readonly #createdAt: Date;
  #state: OffboardingProcessState;
  #channelId: ChannelId | null;
  #handoverDossier: string | null;
  #assignedReviewer: UserId | null;
  readonly #tasks: unknown[];
  readonly #domainEvents: DomainEvent[];

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
  get createdAt(): Date { return this.#createdAt; }
  get stateName(): string { return this.#state.stateName; }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.#domainEvents];
    this.#domainEvents.length = 0;
    return events;
  }
}
