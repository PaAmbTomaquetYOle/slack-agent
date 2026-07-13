import type {
  McpTool,
  McpToolResult,
  McpPrompt,
  McpPromptResult,
  McpResource,
  McpResourceContent,
  McpResourceTemplate,
} from "../../domain/index.js";

export interface IMcpClient {
  connect(): Promise<void>;
  isConnected(): boolean;
  close(): Promise<void>;

  listTools(): Promise<McpTool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult>;

  listPrompts(): Promise<McpPrompt[]>;
  getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptResult>;

  listResources(): Promise<McpResource[]>;
  listResourceTemplates(): Promise<McpResourceTemplate[]>;
  readResource(uri: string): Promise<McpResourceContent[]>;
}
