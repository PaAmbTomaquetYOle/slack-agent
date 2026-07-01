import { App } from '@slack/bolt';
import type { IOffboardingProcessRepository, IInterviewRepository, IDossierRepository, IMessagingPort, IUserInfoProvider } from '../application/ports';
import type { IMcpService, IOffboardingService } from '../application/serviceInterfaces';
import { McpClient, SlackMessagingAdapter, SlackUserInfoProvider, HttpOffboardingProcessRepository, HttpInterviewRepository, HttpDossierRepository } from './adapters';
import { McpPromptController, OffboardingController, AppMentionController } from './controllers';
import { APP_OPTIONS, SETTINGS } from './settings';
import { McpService, OffboardingService } from '../application/services';
import { DomainEventBus, createOffboardingStartedHandler } from '../application/events';
import { OffboardingStartedEvent } from '../domain';
import { createBackendHttpClient } from './http';

export class AppFactory {
  private createMcpClient() {
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

    // HTTP client (shared)
    const httpClient = createBackendHttpClient();

    // Offboarding wiring
    const repository: IOffboardingProcessRepository = new HttpOffboardingProcessRepository(httpClient);
    const interviewRepository: IInterviewRepository = new HttpInterviewRepository(httpClient);
    const dossierRepository: IDossierRepository = new HttpDossierRepository(httpClient);
    const messagingPort: IMessagingPort = new SlackMessagingAdapter(app.client);
    const userInfoProvider: IUserInfoProvider = new SlackUserInfoProvider(app.client);
    const eventBus = new DomainEventBus();
    eventBus.subscribe(OffboardingStartedEvent.EVENT_NAME, createOffboardingStartedHandler(messagingPort));
    const offboardingService: IOffboardingService = new OffboardingService(repository, eventBus, userInfoProvider);
    new OffboardingController(offboardingService).register(app);
    new AppMentionController().register(app);

    return app;
  }
}
