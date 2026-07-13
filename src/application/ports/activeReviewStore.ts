import type { ProcessId, UserId } from '../../domain';
import type { ActiveReview, ReviewScope } from '../../domain';

/**
 * Tracks which employees currently have a review process being interviewed over Slack DM
 * (SA-20). In-memory only — see ActiveReview's docstring for why (no backend HTTP read model
 * for review processes).
 */
export interface IActiveReviewStore {
  /** Returns the active review for an employee, or null if they have none in flight. */
  find(employeeId: UserId): ActiveReview | null;
  /**
   * Starts tracking a review as active, replacing any existing entry for the employee.
   * Idempotent by design: the triggering Kafka message (`{scope}_review.state_changed`) can be
   * redelivered at-least-once, and re-processing it must not throw.
   */
  start(employeeId: UserId, processId: ProcessId, reviewScope: ReviewScope): ActiveReview;
  /** Stops tracking a review (interview completed, or the process left `in_progress`). */
  end(employeeId: UserId): void;
}
