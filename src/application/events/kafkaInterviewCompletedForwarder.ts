import type { DomainEvent, InterviewTurn, OutboundInterviewTurnPayload } from '../../domain/index.js';
import type { InterviewCompletedEvent } from '../../domain/index.js';
import { OUTBOUND_INTERVIEW_COMPLETED } from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isInterviewCompletedEvent(event: DomainEvent): event is InterviewCompletedEvent {
  return event.eventName === 'interview.completed';
}

function toOutboundTurn(turn: InterviewTurn): OutboundInterviewTurnPayload {
  return {
    turn_type: turn.turnType,
    speaker_role: turn.speakerRole,
    timestamp: turn.timestamp.toISOString(),
    content: turn.content,
    order: turn.order,
    ...(turn.topic !== null ? { topic: turn.topic } : {}),
    ...(turn.sentiment !== null ? { sentiment: turn.sentiment } : {}),
    ...(turn.answerText !== null ? { answer_text: turn.answerText } : {}),
  };
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards InterviewCompletedEvent
 * as an `interview.completed` event for the backend to consume.
 */
export function createKafkaInterviewCompletedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isInterviewCompletedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: OUTBOUND_INTERVIEW_COMPLETED,
      payload: {
        process_id: event.processId.value,
        turns: event.turns.map(toOutboundTurn),
      },
    });
  };
}
