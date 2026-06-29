import type { App } from '@slack/bolt';
import { BaseController } from './baseController';

export class AppMentionController extends BaseController {
  register(app: App): void {
    app.event('app_mention', async ({ event, say }) => {
      await say({
        text: `👋 ¡Hola <@${event.user}>! Soy OffBoardMe, tu asistente de captura de conocimiento. ¿En qué puedo ayudarte?`,
        thread_ts: event.ts,
      });
    });
  }
}
