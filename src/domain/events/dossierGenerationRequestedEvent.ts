import type { DomainEvent } from './domainEvent.js';
import type { ProcessId } from '../valueObjects/index.js';

export class DossierGenerationRequestedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'dossier.generation_requested' as const;
  readonly eventName = DossierGenerationRequestedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;

  constructor(processId: ProcessId, occurredOn: Date = new Date()) {
    this.occurredOn = occurredOn;
    this.processId = processId;
  }
}
