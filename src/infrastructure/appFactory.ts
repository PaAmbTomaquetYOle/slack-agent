import { App } from '@slack/bolt';
import type { IMcpClient } from '../application/ports';
import { McpClient } from './adapters';
import { McpPromptController } from './controllers';
import { APP_OPTIONS, SETTINGS } from './settings';
import type { IMcpService } from '../application/serviceInterfaces';
import { McpService } from '../application/services';

export class AppFactory {
  private createMcpClient(): IMcpClient {
    return new McpClient(SETTINGS.MCP_SERVER_URL);
  }

  private createMcpService(): IMcpService {
    return new McpService(this.createMcpClient());
  }

  createApp(): App {
    const app = new App(APP_OPTIONS);
    const mcpService = this.createMcpService();
    new McpPromptController(mcpService).register(app);
    return app;
  }
}