import { McpTool, McpToolResult } from "../../domain";
import { IMcpClient } from "../ports";
import { IMcpService } from "../serviceInterfaces";

export class McpService implements IMcpService {
    readonly #mcpClient: IMcpClient;

    constructor(mcpClient: IMcpClient) {
        this.#mcpClient = mcpClient;
    }

    async discoverTools(): Promise<McpTool[]> {
        if (!this.#mcpClient.isConnected()) {
            await this.#mcpClient.connect();
        }
        return this.#mcpClient.listTools();
    }

    async callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult> {
        if (!this.#mcpClient.isConnected()) {
            await this.#mcpClient.connect();
        }
        return this.#mcpClient.callTool(name, args);
    }
}