import type { ProcessId, UserId } from '../valueObjects/index.js';
import type { ReviewScope } from './reviewScope.js';

/**
 * A review process currently being interviewed over Slack DM, tracked entirely in memory
 * (SA-20): unlike offboarding, the backend exposes no HTTP read model for review processes
 * (BE-23 kept them Kafka-only), so slack-agent cannot ask "does this employee have an active
 * review?" the way it asks for offboarding. It is told once, via `monthly_review.state_changed`/
 * `annual_review.state_changed` turning to `in_progress`, and tracks it locally until the
 * interview completes. This does not survive a slack-agent restart — a known, accepted gap
 * (see IActiveReviewStore).
 */
export interface ActiveReview {
  readonly processId: ProcessId;
  readonly employeeId: UserId;
  readonly reviewScope: ReviewScope;
}
