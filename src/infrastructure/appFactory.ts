import { App } from '@slack/bolt';
import type { IMcpClient, IOffboardingRepository, IMessagingPort } from '../application/ports';
import type { IMcpService, IOffboardingService } from '../application/serviceInterfaces';
import { McpClient, SlackMessagingAdapter } from './adapters';
import { McpPromptController, OffboardingController } from './controllers';
import { InMemoryOffboardingRepository } from './repositories';
import { APP_OPTIONS, SETTINGS } from './settings';
import { McpService, OffboardingService } from '../application/services';
import { DomainEventBus, createOffboardingStartedHandler } from '../application/events';

export class AppFactory {
  private createMcpClient(): IMcpClient {
    return new McpClient(SETTINGS.MCP_SERVER_URL);
  }

  private createMcpService(): IMcpService {
    return new McpService(this.createMcpClient());
  }

  createApp(): App {
    const app = new App(APP_OPTIONS);

    // MCP wiring (existing)
    const mcpService = this.createMcpService();
    new McpPromptController(mcpService).register(app);

    // Offboarding wiring
    const repository: IOffboardingRepository = new InMemoryOffboardingRepository();
    const messagingPort: IMessagingPort = new SlackMessagingAdapter(app.client);
    const eventBus = new DomainEventBus();
    eventBus.subscribe('offboarding.started', createOffboardingStartedHandler(messagingPort));
    const offboardingService: IOffboardingService = new OffboardingService(repository, eventBus);
    new OffboardingController(offboardingService).register(app);

    return app;
  }
}
