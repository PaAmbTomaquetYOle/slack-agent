import type {
  McpTool,
  McpToolResult,
  McpPrompt,
  McpPromptResult,
  McpResource,
  McpResourceContent,
  McpResourceTemplate,
} from "../../domain";
import { IMcpClient } from "../ports";
import { IMcpService } from "../serviceInterfaces";

export class McpService implements IMcpService {
  readonly #mcpClient: IMcpClient;

  constructor(mcpClient: IMcpClient) {
    this.#mcpClient = mcpClient;
  }

  extractPendingJiraTasksPrompt(assigneeName: string): Promise<McpPromptResult> {
    return this.getPrompt("extract_pending_jira_tasks", {assignee: assigneeName});
  }

  extractPendingTrelloTasksPrompt(assigneeName: string): Promise<McpPromptResult> {
    return this.getPrompt("extract_pending_trello_tasks", {assignee: assigneeName});
  }

  jiraLoginPrompt(): Promise<McpPromptResult> {
    return this.getPrompt("jira_login");
  }

  trelloLoginPrompt(): Promise<McpPromptResult> {
    return this.getPrompt("trello_login");
  }

  private async ensureConnected(): Promise<void> {
    if (!this.#mcpClient.isConnected()) {
      await this.#mcpClient.connect();
    }
  }

  async discoverTools(): Promise<McpTool[]> {
    await this.ensureConnected();
    return this.#mcpClient.listTools();
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult> {
    await this.ensureConnected();
    return this.#mcpClient.callTool(name, args);
  }

  async listPrompts(): Promise<McpPrompt[]> {
    await this.ensureConnected();
    return this.#mcpClient.listPrompts();
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptResult> {
    await this.ensureConnected();
    return this.#mcpClient.getPrompt(name, args);
  }

  async listResources(): Promise<McpResource[]> {
    await this.ensureConnected();
    return this.#mcpClient.listResources();
  }

  async listResourceTemplates(): Promise<McpResourceTemplate[]> {
    await this.ensureConnected();
    return this.#mcpClient.listResourceTemplates();
  }

  async readResource(uri: string): Promise<McpResourceContent[]> {
    await this.ensureConnected();
    return this.#mcpClient.readResource(uri);
  }
}