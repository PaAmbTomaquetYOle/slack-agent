import {IMcpClient} from "../application/ports";
import {McpClient} from "./adapters";
import {SETTINGS} from "./settings";
import {IMcpService} from "../application/serviceInterfaces";
import {McpService} from "../application/services";

export class AppFactory {
    private createMcpClient(): IMcpClient {
        return new McpClient(SETTINGS.MCP_SERVER_URL);
    }

    private createMcpService(): IMcpService {
        return new McpService(this.createMcpClient());
    }
}