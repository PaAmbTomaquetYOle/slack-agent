import type { DomainEvent } from './domainEvent';
import type { ProcessId, InterviewId } from '../valueObjects/index';
import type { DossierDraft } from '../dossier';

export class DossierGenerationRequestedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'dossier.generation_requested' as const;
  readonly eventName = DossierGenerationRequestedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly interviewId: InterviewId;
  readonly draft: DossierDraft;

  constructor(
    processId: ProcessId,
    interviewId: InterviewId,
    draft: DossierDraft,
    occurredOn: Date = new Date(),
  ) {
    this.occurredOn = occurredOn;
    this.processId = processId;
    this.interviewId = interviewId;
    this.draft = draft;
  }
}
