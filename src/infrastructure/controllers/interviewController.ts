import type { App } from '@slack/bolt';
import type { IInterviewService } from '../../application/serviceInterfaces';
import { BaseController } from './baseController';

export class InterviewController extends BaseController {
  readonly #interviewService: IInterviewService;

  constructor(interviewService: IInterviewService) {
    super();
    this.#interviewService = interviewService;
  }

  register(app: App): void {
    app.message(async ({ message }) => {
      if (message.subtype !== undefined) return;
      if (message.channel_type !== 'im') return;
      if (!message.text) return;
      await this.#interviewService.handleIncomingDirectMessage(message.user, message.text);
    });
  }
}
