import { McpTool, McpToolResult } from "../../domain";

export interface IMcpService {
    discoverTools(): Promise<McpTool[]>;
    callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult>;
}