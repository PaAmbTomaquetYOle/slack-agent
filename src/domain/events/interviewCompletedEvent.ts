import type { DomainEvent } from './domainEvent.js';
import type { ProcessId, InterviewId } from '../valueObjects/index.js';
import type { InterviewTurn } from '../interview/index.js';

export class InterviewCompletedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'interview.completed' as const;
  readonly eventName = InterviewCompletedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly interviewId: InterviewId;
  readonly turns: readonly InterviewTurn[];

  constructor(
    processId: ProcessId,
    interviewId: InterviewId,
    turns: readonly InterviewTurn[],
    occurredOn: Date = new Date(),
  ) {
    this.occurredOn = occurredOn;
    this.processId = processId;
    this.interviewId = interviewId;
    this.turns = turns;
  }
}
