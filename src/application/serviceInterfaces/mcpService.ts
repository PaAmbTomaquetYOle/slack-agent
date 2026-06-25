import type {
  McpTool,
  McpToolResult,
  McpPrompt,
  McpPromptResult,
  McpResource,
  McpResourceContent,
  McpResourceTemplate,
} from "../../domain";

export interface IMcpService {
  discoverTools(): Promise<McpTool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult>;

  listPrompts(): Promise<McpPrompt[]>;
  getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptResult>;

  listResources(): Promise<McpResource[]>;
  listResourceTemplates(): Promise<McpResourceTemplate[]>;
  readResource(uri: string): Promise<McpResourceContent[]>;

  jiraLoginPrompt(): Promise<McpPromptResult>;
  trelloLoginPrompt(): Promise<McpPromptResult>;

  extractPendingJiraTasksPrompt(assigneeName: string): Promise<McpPromptResult>;
  extractPendingTrelloTasksPrompt(assigneeName: string): Promise<McpPromptResult>;
}