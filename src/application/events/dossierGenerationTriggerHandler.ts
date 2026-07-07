import type { DomainEvent } from '../../domain';
import type { InterviewCompletedEvent } from '../../domain';
import type { IDossierService } from '../serviceInterfaces';

function isInterviewCompletedEvent(event: DomainEvent): event is InterviewCompletedEvent {
  return event.eventName === 'interview.completed';
}

/**
 * Bridges the in-process DomainEventBus: when a guided interview completes,
 * kicks off dossier generation for that process.
 */
export function createDossierGenerationTriggerHandler(dossierService: IDossierService) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isInterviewCompletedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await dossierService.handleInterviewCompleted(event.processId.value, event.interviewId.value, event.turns);
  };
}
