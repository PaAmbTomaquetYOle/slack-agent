import type { DomainEvent } from './domainEvent.js';
import type { UserId } from '../valueObjects/index.js';

export class OffboardingStartedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'offboarding.started' as const;
  readonly eventName = OffboardingStartedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly departingUserId: UserId;
  readonly initiatorId: UserId;
  readonly employeeName?: string;
  readonly managerName?: string;

  constructor(
    departingUserId: UserId,
    initiatorId: UserId,
    employeeName?: string,
    managerName?: string,
    occurredOn: Date = new Date(),
  ) {
    this.occurredOn = occurredOn;
    this.departingUserId = departingUserId;
    this.initiatorId = initiatorId;
    if (employeeName !== undefined) this.employeeName = employeeName;
    if (managerName !== undefined) this.managerName = managerName;
  }
}
