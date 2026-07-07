import type { WebClient } from '@slack/web-api';
import type { EphemeralAction, IMessagingPort } from '../../application/ports';

export class SlackMessagingAdapter implements IMessagingPort {
  readonly #client: WebClient;

  constructor(client: WebClient) {
    this.#client = client;
  }

  async sendDirectMessage(userId: string, text: string): Promise<void> {
    const result = await this.#client.conversations.open({ users: userId });
    const channelId = result.channel?.id;
    if (!channelId) {
      throw new Error(`Could not open DM channel with user ${userId}`);
    }
    await this.#client.chat.postMessage({ channel: channelId, text });
  }

  async sendEphemeralActionPrompt(
    channelId: string,
    userId: string,
    text: string,
    actions: EphemeralAction[],
  ): Promise<void> {
    await this.#client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text } },
        {
          type: 'actions',
          elements: actions.map((action) => ({
            type: 'button',
            action_id: action.actionId,
            text: { type: 'plain_text', text: action.text },
            value: action.value,
          })),
        },
      ],
    });
  }

  async sendChannelMessage(channelId: string, text: string): Promise<void> {
    await this.#client.chat.postMessage({ channel: channelId, text });
  }

  async createChannelCanvas(channelId: string, title: string, markdown: string): Promise<void> {
    await this.#client.conversations.canvases.create({
      channel_id: channelId,
      title,
      document_content: { type: 'markdown', markdown },
    });
  }
}
