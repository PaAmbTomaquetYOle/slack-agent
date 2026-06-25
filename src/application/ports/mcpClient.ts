import { McpTool, McpToolResult } from "../../domain";

export interface IMcpClient {
  connect(): Promise<void>;
  isConnected(): boolean;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult>;
  close(): Promise<void>;
}
