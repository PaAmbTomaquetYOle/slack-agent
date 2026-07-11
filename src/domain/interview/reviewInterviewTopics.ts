import type { ReviewScope } from '../reviewProcess/reviewScope';
import { INTERVIEW_TOPICS, type InterviewTopic } from './interviewTopic';

/**
 * Which INTERVIEW_TOPICS a review interview covers, scoped by review type (SA-20). Reuses the
 * existing offboarding topic vocabulary rather than inventing new ones, so
 * `GeminiReviewInterviewAgent`'s topic classification stays within the same validated set.
 *
 * - Monthly: lightweight, recent-activity only — just current work in flight.
 * - Annual: exhaustive — every topic, same coverage bar as an offboarding handover.
 */
export const MONTHLY_REVIEW_TOPICS: readonly InterviewTopic[] = ['current_projects'];
export const ANNUAL_REVIEW_TOPICS: readonly InterviewTopic[] = INTERVIEW_TOPICS;

export function reviewTopicsFor(reviewScope: ReviewScope): readonly InterviewTopic[] {
  return reviewScope === 'monthly' ? MONTHLY_REVIEW_TOPICS : ANNUAL_REVIEW_TOPICS;
}
