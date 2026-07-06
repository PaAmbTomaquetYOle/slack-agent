import type { DomainEvent } from './domainEvent';
import type { ProcessId, InterviewId } from '../valueObjects/index';
import type { InterviewTurn } from '../interview';

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
