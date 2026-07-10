import type { App } from '@slack/bolt';
import type { IExpertRecommendationService } from '../../application/serviceInterfaces';
import { BaseController } from './baseController';

const USAGE_HINT = 'Usage: `/find-expert <topic>`, e.g. `/find-expert kubernetes`.';

export class ExpertRecommendationController extends BaseController {
  readonly #expertRecommendationService: IExpertRecommendationService;
  readonly #knowledgeGraphUrl: string;

  constructor(expertRecommendationService: IExpertRecommendationService, knowledgeGraphUrl: string) {
    super();
    this.#expertRecommendationService = expertRecommendationService;
    this.#knowledgeGraphUrl = knowledgeGraphUrl;
  }

  register(app: App): void {
    app.command('/find-expert', async ({ ack, command, client }) => {
      await ack();
      const topic = command.text?.trim();
      if (!topic) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: USAGE_HINT,
        });
        return;
      }
      await this.#expertRecommendationService.findExperts(command.channel_id, command.user_id, topic);
    });

    app.command('/knowledge-graph', async ({ ack, command, client }) => {
      await ack();
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `:globe_with_meridians: Explore the knowledge graph: ${this.#knowledgeGraphUrl}`,
      });
    });
  }
}
