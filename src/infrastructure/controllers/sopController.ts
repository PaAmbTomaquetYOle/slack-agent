import type { App } from '@slack/bolt';
import type { ISopService } from '../../application/serviceInterfaces';
import { SOP_ACCEPT_ACTION_ID, SOP_DECLINE_ACTION_ID } from '../../application/serviceInterfaces';
import { BaseController } from './baseController';

interface DecisionBody {
  channel?: { id: string };
}

interface DecisionAction {
  value?: string;
}

export class SopController extends BaseController {
  readonly #sopService: ISopService;

  constructor(sopService: ISopService) {
    super();
    this.#sopService = sopService;
  }

  register(app: App): void {
    app.message(async ({ message }) => {
      if (message.subtype !== undefined) return;
      if (message.channel_type === 'im') return;
      if (!message.text) return;
      await this.#sopService.handleChannelMessage(message.channel, message.user, message.text, message.ts);
    });

    app.event('reaction_added', async ({ event, client }) => {
      if (event.item.type !== 'message') return;
      const result = await client.reactions.get({ channel: event.item.channel, timestamp: event.item.ts });
      const reactionCount = (result.message?.reactions ?? []).reduce(
        (sum, reaction) => sum + (reaction.count ?? 0),
        0,
      );
      await this.#sopService.handleReactionAdded(event.item.channel, event.item.ts, reactionCount);
    });

    app.action(SOP_ACCEPT_ACTION_ID, async ({ ack, body, action }) => {
      await ack();
      await this.#handleDecision(body as DecisionBody, action as DecisionAction, true);
    });

    app.action(SOP_DECLINE_ACTION_ID, async ({ ack, body, action }) => {
      await ack();
      await this.#handleDecision(body as DecisionBody, action as DecisionAction, false);
    });
  }

  async #handleDecision(body: DecisionBody, action: DecisionAction, accepted: boolean): Promise<void> {
    const channelId = body.channel?.id;
    const messageTs = action.value;
    if (!channelId || !messageTs) return;
    await this.#sopService.handleSopDecision(channelId, messageTs, accepted);
  }
}
