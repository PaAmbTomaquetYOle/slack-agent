import type { App } from '@slack/bolt';
import type { IAuthService, IInterviewService } from '../../application/serviceInterfaces';
import { BaseController } from './baseController';

export class DirectMessageController extends BaseController {
  readonly #authService: IAuthService;
  readonly #interviewService: IInterviewService;

  constructor(authService: IAuthService, interviewService: IInterviewService) {
    super();
    this.#authService = authService;
    this.#interviewService = interviewService;
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

      await this.#interviewService.handleIncomingDirectMessage(message.user, message.text);
    });
  }
}
