import { McpTool } from "../../domain";

export interface IMcpService {
    discoverTools(): Promise<McpTool[]>;
}