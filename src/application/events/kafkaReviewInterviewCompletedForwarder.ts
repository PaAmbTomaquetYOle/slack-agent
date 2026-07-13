import type { DomainEvent, InterviewTurn, OutboundInterviewTurnPayload } from '../../domain';
import type { ReviewInterviewCompletedEvent } from '../../domain';
import { MONTHLY_REVIEW_INTERVIEW_COMPLETED, ANNUAL_REVIEW_INTERVIEW_COMPLETED } from '../../domain';
import type { IEventPublisher } from '../ports';

function isReviewInterviewCompletedEvent(event: DomainEvent): event is ReviewInterviewCompletedEvent {
  return event.eventName === 'review_interview.completed';
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
 * Bridges the in-process DomainEventBus to Kafka: forwards ReviewInterviewCompletedEvent as
 * `monthly_review.interview_completed` or `annual_review.interview_completed`, picked by
 * event.reviewScope (SA-20).
 */
export function createKafkaReviewInterviewCompletedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isReviewInterviewCompletedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    const eventType =
      event.reviewScope === 'monthly' ? MONTHLY_REVIEW_INTERVIEW_COMPLETED : ANNUAL_REVIEW_INTERVIEW_COMPLETED;
    await publisher.publish({
      eventType,
      payload: {
        process_id: event.processId.value,
        turns: event.turns.map(toOutboundTurn),
      },
    });
  };
}
