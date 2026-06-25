import { McpTool } from "../../domain";
import { IMcpClient } from "../ports";
import { IMcpService } from "../serviceInterfaces";

export class McpService implements IMcpService {
    readonly #mcpClient: IMcpClient;

    constructor(mcpClient: IMcpClient) {
        this.#mcpClient = mcpClient;
    }

    discoverTools(): Promise<McpTool[]> {
        this.#mcpClient.connect();
        return this.#mcpClient.listTools();
    }
}