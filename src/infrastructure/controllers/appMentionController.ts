import type { App } from '@slack/bolt';
import type { IExpertRecommendationService } from '../../application/serviceInterfaces';
import { BaseController } from './baseController';

const EXPERT_QUERY_PATTERNS = [
  /who\s+knows?\s+about\s+(.+?)[?.]?\s*$/i,
  /expert\s+(?:on|in|for)\s+(.+?)[?.]?\s*$/i,
  /qui[eé]n\s+sabe\s+(?:de|sobre)\s+(.+?)[?.]?\s*$/i,
  /experto\s+en\s+(.+?)[?.]?\s*$/i,
];

export class AppMentionController extends BaseController {
  readonly #expertRecommendationService: IExpertRecommendationService | undefined;

  constructor(expertRecommendationService?: IExpertRecommendationService) {
    super();
    this.#expertRecommendationService = expertRecommendationService;
  }

  register(app: App): void {
    app.event('app_mention', async ({ event, say }) => {
      const topic = AppMentionController.#extractExpertQuery(event.text);
      if (topic && this.#expertRecommendationService) {
        await this.#expertRecommendationService.findExperts(event.channel, event.user ?? '', topic);
        return;
      }

      await say({
        text: `👋 ¡Hola <@${event.user}>! Soy BrainTrust, tu asistente de captura de conocimiento. ¿En qué puedo ayudarte?`,
        thread_ts: event.ts,
      });
    });
  }

  static #extractExpertQuery(text: string): string | null {
    const withoutMentions = text.replace(/<@[A-Z0-9]+>/gi, '').trim();
    for (const pattern of EXPERT_QUERY_PATTERNS) {
      const match = withoutMentions.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return null;
  }
}
