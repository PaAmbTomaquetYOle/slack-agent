import type { DomainEvent } from './domainEvent.js';
import type { ProcessId } from '../valueObjects/index.js';
import type { ReviewScope } from '../reviewProcess/index.js';

export class ReviewDossierGenerationRequestedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'review_dossier_generation_requested' as const;
  readonly eventName = ReviewDossierGenerationRequestedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly reviewScope: ReviewScope;

  constructor(processId: ProcessId, reviewScope: ReviewScope, occurredOn: Date = new Date()) {
    this.occurredOn = occurredOn;
    this.processId = processId;
    this.reviewScope = reviewScope;
  }
}
