import type { DomainEvent, InterviewTurn, OutboundInterviewTurnPayload } from '../../domain/index.js';
import type { InterviewTurnRecordedEvent } from '../../domain/index.js';
import { INTERVIEW_TURN_RECORDED } from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isInterviewTurnRecordedEvent(event: DomainEvent): event is InterviewTurnRecordedEvent {
  return event.eventName === 'interview.turn_recorded';
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
 * Bridges the in-process DomainEventBus to Kafka: forwards InterviewTurnRecordedEvent as an
 * `interview.turn_recorded` event so the backend can persist in-flight turns incrementally
 * (SA-16), instead of only receiving the full turn list at `interview.completed`.
 */
export function createKafkaInterviewTurnRecordedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isInterviewTurnRecordedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: INTERVIEW_TURN_RECORDED,
      payload: {
        process_id: event.processId.value,
        turns: event.turns.map(toOutboundTurn),
      },
    });
  };
}
