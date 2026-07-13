import type { App } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import type { ISopService } from '../../application/index.js';
import { SOP_ACCEPT_ACTION_ID, SOP_DECLINE_ACTION_ID } from '../../application/index.js';
import { BaseController } from './baseController.js';

const SOP_TITLE_MODAL_CALLBACK_ID = 'sop_title_modal';
const SOP_TITLE_BLOCK_ID = 'sop_title_block';
const SOP_TITLE_ACTION_ID = 'sop_title_input';

interface DecisionBody {
  channel?: { id: string };
  trigger_id?: string;
}

interface DecisionAction {
  value?: string;
}

interface SopTitleModalMetadata {
  channelId: string;
  messageTs: string;
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
      if (!this.#sopService.isMonitoredChannel(event.item.channel)) return;
      const result = await client.reactions.get({ channel: event.item.channel, timestamp: event.item.ts });
      const reactionCount = (result.message?.reactions ?? []).reduce(
        (sum, reaction) => sum + (reaction.count ?? 0),
        0,
      );
      await this.#sopService.handleReactionAdded(event.item.channel, event.item.ts, reactionCount);
    });

    app.action(SOP_ACCEPT_ACTION_ID, async ({ ack, body, action, client }) => {
      await ack();
      await this.#openTitleModal(body as DecisionBody, action as DecisionAction, client);
    });

    app.action(SOP_DECLINE_ACTION_ID, async ({ ack, body, action }) => {
      await ack();
      await this.#handleDecision(body as DecisionBody, action as DecisionAction, false);
    });

    app.view(SOP_TITLE_MODAL_CALLBACK_ID, async ({ ack, view }) => {
      await ack();
      const metadata = SopController.#parseMetadata(view.private_metadata);
      if (!metadata) return;
      const title = view.state.values[SOP_TITLE_BLOCK_ID]?.[SOP_TITLE_ACTION_ID]?.value?.trim();
      if (!title) return;
      await this.#sopService.handleSopDecision(metadata.channelId, metadata.messageTs, true, title);
    });
  }

  async #openTitleModal(body: DecisionBody, action: DecisionAction, client: WebClient): Promise<void> {
    const channelId = body.channel?.id;
    const messageTs = action.value;
    if (!channelId || !messageTs || !body.trigger_id) return;

    const defaultTitle = this.#sopService.deriveSopTitle(channelId, messageTs);
    if (defaultTitle === null) return;

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: SOP_TITLE_MODAL_CALLBACK_ID,
        private_metadata: JSON.stringify({ channelId, messageTs } satisfies SopTitleModalMetadata),
        title: { type: 'plain_text', text: 'Save as SOP' },
        submit: { type: 'plain_text', text: 'Save' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: SOP_TITLE_BLOCK_ID,
            label: { type: 'plain_text', text: 'Title' },
            element: {
              type: 'plain_text_input',
              action_id: SOP_TITLE_ACTION_ID,
              initial_value: defaultTitle,
            },
          },
        ],
      },
    });
  }

  async #handleDecision(body: DecisionBody, action: DecisionAction, accepted: boolean): Promise<void> {
    const channelId = body.channel?.id;
    const messageTs = action.value;
    if (!channelId || !messageTs) return;
    await this.#sopService.handleSopDecision(channelId, messageTs, accepted);
  }

  static #parseMetadata(raw: string | undefined): SopTitleModalMetadata | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<SopTitleModalMetadata>;
      if (!parsed.channelId || !parsed.messageTs) return null;
      return { channelId: parsed.channelId, messageTs: parsed.messageTs };
    } catch {
      return null;
    }
  }
}
