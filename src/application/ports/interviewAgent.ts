import type { InterviewTopic, InterviewTurn, TaskSource } from '../../domain';

export interface InterviewAgentContext {
  employeeName: string;
  /** The departing employee's Slack user id, forwarded as `user_id` to MCP task-extraction tools. */
  slackUserId: string;
  pendingTopics: readonly InterviewTopic[];
  turns: readonly InterviewTurn[];
  incomingMessage: string;
}

/** Plain-data shape of a Jira/Trello task as extracted from an MCP tool call (SA-18). */
export interface ExtractedTask {
  id: string;
  title: string;
  source: TaskSource;
  status: string;
  url: string | null;
  description: string | null;
}

export interface InterviewAgentTurnResult {
  replyText: string;
  topic: InterviewTopic | null;
  sentiment: string | null;
  answerText: string | null;
  isComplete: boolean;
  /** Tasks fetched via MCP tool calls during this turn, if any (SA-18). */
  tasks?: ExtractedTask[];
}

export interface IInterviewAgent {
  nextTurn(context: InterviewAgentContext): Promise<InterviewAgentTurnResult>;
}
