import type { InterviewTopic, InterviewTurn, ReviewScope } from '../../domain/index.js';
import type { InterviewAgentTurnResult } from './interviewAgent.js';

export interface ReviewInterviewAgentContext {
  employeeName: string;
  slackUserId: string;
  reviewScope: ReviewScope;
  pendingTopics: readonly InterviewTopic[];
  turns: readonly InterviewTurn[];
  incomingMessage: string;
}

/**
 * Drives a monthly/annual knowledge-retention review interview (SA-20). A separate port from
 * IInterviewAgent — reviews don't extract Jira/Trello tasks and use review-appropriate framing
 * ("you're staying", not "you're leaving"), so the two prompts genuinely diverge; the turn
 * result shape stays the same (InterviewAgentTurnResult), just without `tasks`.
 */
export interface IReviewInterviewAgent {
  nextTurn(context: ReviewInterviewAgentContext): Promise<InterviewAgentTurnResult>;
}
