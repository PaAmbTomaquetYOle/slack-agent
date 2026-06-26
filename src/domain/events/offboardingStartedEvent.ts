import type { DomainEvent } from './domainEvent';
import type { ProcessId, UserId } from '../valueObjects/index';

export class OffboardingStartedEvent implements DomainEvent {
  readonly eventName = 'offboarding.started';
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly departingUserId: UserId;
  readonly initiatorId: UserId;

  constructor(processId: ProcessId, departingUserId: UserId, initiatorId: UserId, occurredOn: Date = new Date()) {
    this.occurredOn = occurredOn;
    this.processId = processId;
    this.departingUserId = departingUserId;
    this.initiatorId = initiatorId;
  }
}
