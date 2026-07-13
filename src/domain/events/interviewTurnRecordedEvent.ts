import type { DomainEvent } from './domainEvent';
import type { ProcessId } from '../valueObjects';
import type { InterviewTurn } from '../interview';

/**
 * Raised each time one or more turns are appended to an in-flight interview session, so the
 * backend can persist them incrementally (SA-16) instead of only receiving the full turn list
 * at `interview.completed`. A restart between now and completion no longer loses these turns.
 */
export class InterviewTurnRecordedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'interview.turn_recorded' as const;
  readonly eventName = InterviewTurnRecordedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly turns: readonly InterviewTurn[];

  constructor(processId: ProcessId, turns: readonly InterviewTurn[], occurredOn: Date = new Date()) {
    this.occurredOn = occurredOn;
    this.processId = processId;
    this.turns = turns;
  }
}
