import type { DomainEvent } from './domainEvent.js';
import type { ProcessId } from '../valueObjects/index.js';
import type { UserId } from '../valueObjects/index.js';

export class OffboardingStartedEvent implements DomainEvent {
  readonly eventName = 'offboarding.started';
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly departingUserId: UserId;
  readonly initiatorId: UserId;

  constructor(processId: ProcessId, departingUserId: UserId, initiatorId: UserId) {
    this.occurredOn = new Date();
    this.processId = processId;
    this.departingUserId = departingUserId;
    this.initiatorId = initiatorId;
  }
}
