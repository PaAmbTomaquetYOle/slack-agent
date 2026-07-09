import type { App } from '@slack/bolt';
import type { IAuthService, IOffboardingOrchestrator } from '../../application';
import { BaseController } from './baseController';

export class DirectMessageController extends BaseController {
  readonly #authService: IAuthService;
  readonly #orchestrator: IOffboardingOrchestrator;

  constructor(authService: IAuthService, orchestrator: IOffboardingOrchestrator) {
    super();
    this.#authService = authService;
    this.#orchestrator = orchestrator;
  }

  register(app: App): void {
    app.message(async ({ message }) => {
      if (message.subtype !== undefined) return;
      if (message.channel_type !== 'im') return;
      if (!message.text) return;

      if (this.#authService.hasPendingAuth(message.user)) {
        await this.#authService.handleAuthCodeMessage(message.user, message.text);
        return;
      }

      await this.#orchestrator.handleInterviewMessage(message.user, message.text, message.channel);
    });
  }
}
