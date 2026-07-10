import type { InterviewTopic, InterviewTurn } from '../../domain';

export interface InterviewAgentContext {
  employeeName: string;
  /** The departing employee's Slack user id, forwarded as `user_id` to MCP task-extraction tools. */
  slackUserId: string;
  pendingTopics: readonly InterviewTopic[];
  turns: readonly InterviewTurn[];
  incomingMessage: string;
}

export interface InterviewAgentTurnResult {
  replyText: string;
  topic: InterviewTopic | null;
  sentiment: string | null;
  answerText: string | null;
  isComplete: boolean;
}

export interface IInterviewAgent {
  nextTurn(context: InterviewAgentContext): Promise<InterviewAgentTurnResult>;
}
