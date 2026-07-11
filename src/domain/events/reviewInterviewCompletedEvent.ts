import type { DomainEvent } from './domainEvent';
import type { ProcessId, InterviewId } from '../valueObjects/index';
import type { InterviewTurn } from '../interview';
import type { ReviewScope } from '../reviewProcess';

/**
 * A single local event for both monthly and annual review interviews (SA-20) — reviewScope is
 * data on the event, not part of its identity, so one subscription/forwarder handles both, and
 * the Kafka forwarder picks `monthly_review.interview_completed` vs
 * `annual_review.interview_completed` based on it.
 */
export class ReviewInterviewCompletedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'review_interview.completed' as const;
  readonly eventName = ReviewInterviewCompletedEvent.EVENT_NAME;
  readonly occurredOn: Date;
  readonly processId: ProcessId;
  readonly interviewId: InterviewId;
  readonly reviewScope: ReviewScope;
  readonly turns: readonly InterviewTurn[];

  constructor(
    processId: ProcessId,
    interviewId: InterviewId,
    reviewScope: ReviewScope,
    turns: readonly InterviewTurn[],
    occurredOn: Date = new Date(),
  ) {
    this.occurredOn = occurredOn;
    this.processId = processId;
    this.interviewId = interviewId;
    this.reviewScope = reviewScope;
    this.turns = turns;
  }
}
