import type { App } from '@slack/bolt';
import type { IQuestionSuggestionService } from '../../application/serviceInterfaces/index.js';
import { BaseController } from './baseController.js';

export class QuestionSuggestionController extends BaseController {
  readonly #service: IQuestionSuggestionService;

  constructor(service: IQuestionSuggestionService) {
    super();
    this.#service = service;
  }

  register(app: App): void {
    app.message(async ({ message }) => {
      if (message.subtype !== undefined) return;
      if (message.channel_type === 'im') return;
      if (!message.text) return;
      await this.#service.handleChannelMessage(message.channel, message.user, message.text);
    });
  }
}
