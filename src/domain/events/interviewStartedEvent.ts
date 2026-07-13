import type { DomainEvent } from './domainEvent.js';
import type { ProcessId, UserId } from '../valueObjects/index.js';

export class InterviewStartedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'interview.started' as const;
  readonly eventName = InterviewStartedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly employeeId: UserId;

  constructor(processId: ProcessId, employeeId: UserId, occurredOn: Date = new Date()) {
    this.occurredOn = occurredOn;
    this.processId = processId;
    this.employeeId = employeeId;
  }
}
