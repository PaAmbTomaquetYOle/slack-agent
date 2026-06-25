export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}