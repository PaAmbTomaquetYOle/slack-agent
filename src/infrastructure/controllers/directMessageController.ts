import type { App } from '@slack/bolt';
import type { IAuthService, IOffboardingOrchestrator, IReviewInterviewService } from '../../application/index.js';
import { BaseController } from './baseController.js';

export class DirectMessageController extends BaseController {
  readonly #authService: IAuthService;
  readonly #orchestrator: IOffboardingOrchestrator;
  readonly #reviewInterviewService: IReviewInterviewService;

  constructor(
    authService: IAuthService,
    orchestrator: IOffboardingOrchestrator,
    reviewInterviewService: IReviewInterviewService,
  ) {
    super();
    this.#authService = authService;
    this.#orchestrator = orchestrator;
    this.#reviewInterviewService = reviewInterviewService;
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

      // SA-20: a user has at most one of an active offboarding or an active review in
      // practice — both handlers are safe no-ops when they have nothing tracked for the sender.
      await this.#orchestrator.handleInterviewMessage(message.user, message.text, message.channel);
      await this.#reviewInterviewService.handleIncomingDirectMessage(message.user, message.text);
    });
  }
}
