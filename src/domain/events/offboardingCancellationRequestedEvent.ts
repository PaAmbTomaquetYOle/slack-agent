import type { DomainEvent } from './domainEvent';
import type { ProcessId } from '../valueObjects';

export class OffboardingCancellationRequestedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'offboarding.cancellation_requested' as const;
  readonly eventName = OffboardingCancellationRequestedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;

  constructor(processId: ProcessId, occurredOn: Date = new Date()) {
    this.occurredOn = occurredOn;
    this.processId = processId;
  }
}
